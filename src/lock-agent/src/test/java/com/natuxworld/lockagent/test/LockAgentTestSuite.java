package com.natuxworld.lockagent.test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.Arrays;
import java.util.concurrent.TimeUnit;

/** Cross-process acceptance tests for the premain lock contract. */
public final class LockAgentTestSuite {
    private static final long TIMEOUT_SECONDS = 10L;
    private static final String READY = "NATUX_LOCK_READY_V1";
    private static final String MAIN = "APPLICATION_MAIN_REACHED";

    private final String javaExecutable;
    private final Path agentJar;
    private final String classPath;
    private int assertions;

    private LockAgentTestSuite(String javaExecutable, Path agentJar, String classPath) {
        this.javaExecutable = javaExecutable;
        this.agentJar = agentJar;
        this.classPath = classPath;
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 3) {
            throw new IllegalArgumentException("expected java executable, agent jar, and classpath");
        }
        LockAgentTestSuite suite = new LockAgentTestSuite(
                args[0], Paths.get(args[1]).toAbsolutePath(), args[2]);
        suite.runAll();
    }

    private void runAll() throws Exception {
        Path tempRoot = Files.createTempDirectory("natux lock agent tests ");
        try {
            testReadyPathAndSpaces(tempRoot.resolve("profile path with spaces"));
            testBusyProfileIsIgnored(tempRoot.resolve("busy profile"));
            testBusyGameRejectsStartup(tempRoot.resolve("busy game"));
            testGameLockSymlinkRejectsStartup(tempRoot.resolve("symlink game"));
            testReleaseOnJvmExit(tempRoot.resolve("release on exit"));
            System.out.println("PASS: " + assertions + " lock-agent assertions");
        } finally {
            deleteTree(tempRoot);
        }
    }

    private void testReadyPathAndSpaces(Path userData) throws Exception {
        Files.createDirectories(userData);
        check(userData.toString().contains(" "), "test profile path contains spaces");
        ProcessResult result = runApp(userData);
        check(result.exitCode == 0, "ready-path JVM exits successfully: " + result.output);
        check(containsLine(result.output, READY), "agent emits exact readiness line");
        check(containsLine(result.output, MAIN), "application main runs after readiness");
        check(result.output.indexOf(READY) < result.output.indexOf(MAIN),
                "readiness is emitted before application main");
        check(Files.exists(userData.resolve(".game.lock")), "game lock file persists");
    }

    private void testBusyProfileIsIgnored(Path userData) throws Exception {
        Files.createDirectories(userData);
        Path profilePath = userData.resolve(".profile.lock");
        HeldProcess holder = startHolder(profilePath, userData.resolve("holder-ready"));
        try {
            awaitMarker(holder.readyFile, holder.process, "lock holder acquired .profile.lock");
            ProcessResult result = runApp(userData);
            check(result.exitCode == 0, "busy .profile.lock does not block startup: " + result.output);
            check(containsLine(result.output, READY), "busy .profile.lock still emits readiness");
            check(containsLine(result.output, MAIN), "busy .profile.lock allows application main");
        } finally {
            stopHolder(holder.process);
        }
        check(Files.exists(profilePath), "busy profile lock file persists after holder exits");
    }

    private void testBusyGameRejectsStartup(Path userData) throws Exception {
        Files.createDirectories(userData);
        Path gamePath = userData.resolve(".game.lock");
        HeldProcess holder = startHolder(gamePath, userData.resolve("holder-ready"));
        try {
            awaitMarker(holder.readyFile, holder.process, "lock holder acquired .game.lock");
            ProcessResult result = runApp(userData);
            check(result.exitCode != 0, "busy .game.lock rejects startup");
            check(!containsLine(result.output, READY), "busy .game.lock emits no ready line");
            check(!containsLine(result.output, MAIN), "busy .game.lock prevents application main");
        } finally {
            stopHolder(holder.process);
        }
        check(Files.exists(gamePath), "busy game lock file persists after holder exits");
    }

    private void testGameLockSymlinkRejectsStartup(Path userData) throws Exception {
        Files.createDirectories(userData);
        Path gamePath = userData.resolve(".game.lock");
        Path targetPath = userData.resolveSibling(userData.getFileName() + " target");
        Files.write(targetPath, new byte[] { 7 });
        try {
            Files.createSymbolicLink(gamePath, targetPath);
        } catch (IOException | UnsupportedOperationException | SecurityException unavailable) {
            System.out.println("SKIP: cannot create .game.lock symlink on this host ("
                    + unavailable.getClass().getSimpleName() + ")");
            Files.deleteIfExists(targetPath);
            return;
        }

        ProcessResult result = runApp(userData);
        check(result.exitCode != 0, ".game.lock symlink rejects startup");
        check(!containsLine(result.output, READY), ".game.lock symlink emits no ready line");
        check(!containsLine(result.output, MAIN), ".game.lock symlink prevents application main");
        check(Files.isSymbolicLink(gamePath), "rejected .game.lock symlink remains intact");
        check(Files.readAllBytes(targetPath)[0] == 7, "symlink target remains unchanged");
    }

    private void testReleaseOnJvmExit(Path userData) throws Exception {
        Files.createDirectories(userData);
        RunningProcess first = startApp(userData, true);
        try {
            awaitOutput(first, READY, "long-running JVM acquired game lock");
            awaitOutput(first, MAIN, "long-running application main started");

            ProcessResult busyGame = runApp(userData);
            check(busyGame.exitCode != 0, "game lock remains held while the first JVM runs");
            check(!containsLine(busyGame.output, MAIN), "second JVM cannot reach application main");
        } finally {
            releaseInput(first.process);
        }
        awaitExit(first.process, "long-running JVM exits");

        ProcessResult afterExit = runApp(userData);
        check(afterExit.exitCode == 0, "game lock is released when its JVM exits");
        check(containsLine(afterExit.output, READY), "new JVM becomes ready after prior exit");
        check(containsLine(afterExit.output, MAIN), "new application starts after prior exit");
    }

    private ProcessResult runApp(Path userData) throws Exception {
        RunningProcess running = startApp(userData, false);
        awaitExit(running.process, "application JVM exits");
        return new ProcessResult(running.process.exitValue(), readOutput(running.outputFile));
    }

    private RunningProcess startApp(Path userData, boolean hold) throws IOException {
        Files.createDirectories(userData);
        Path outputFile = Files.createTempFile(userData, "agent-output-", ".log");
        ProcessBuilder builder = new ProcessBuilder(
                javaExecutable,
                "-javaagent:" + agentJar,
                "-cp",
                classPath,
                LockAgentTestApp.class.getName(),
                hold ? "hold" : "exit");
        builder.environment().put("NATUX_PROFILE_DIR", userData.toString());
        builder.redirectErrorStream(true);
        builder.redirectOutput(outputFile.toFile());
        return new RunningProcess(builder.start(), outputFile);
    }

    private HeldProcess startHolder(Path lockPath, Path readyFile) throws IOException {
        ProcessBuilder builder = new ProcessBuilder(
                javaExecutable,
                "-cp",
                classPath,
                LockFileHolder.class.getName(),
                lockPath.toString(),
                readyFile.toString());
        builder.redirectErrorStream(true);
        return new HeldProcess(builder.start(), readyFile);
    }

    private void awaitMarker(Path marker, Process process, String message) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(TIMEOUT_SECONDS);
        while (!Files.exists(marker) && process.isAlive() && System.nanoTime() < deadline) {
            Thread.sleep(20L);
        }
        check(Files.exists(marker), message + (process.isAlive() ? "" : "; holder exited early"));
    }

    private void awaitOutput(RunningProcess process, String text, String message) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(TIMEOUT_SECONDS);
        while (!readOutput(process.outputFile).contains(text)
                && process.process.isAlive()
                && System.nanoTime() < deadline) {
            Thread.sleep(20L);
        }
        check(readOutput(process.outputFile).contains(text), message);
    }

    private void awaitExit(Process process, String message) throws Exception {
        if (!process.waitFor(TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
            process.destroyForcibly();
            process.waitFor();
            throw new AssertionError(message + " timed out");
        }
    }

    private void stopHolder(Process process) throws Exception {
        if (process.isAlive()) {
            releaseInput(process);
        }
        awaitExit(process, "lock holder exits");
    }

    private void releaseInput(Process process) throws IOException {
        try {
            process.getOutputStream().write(1);
            process.getOutputStream().flush();
            process.getOutputStream().close();
        } catch (IOException error) {
            if (process.isAlive()) {
                throw error;
            }
        }
    }

    private String readOutput(Path outputFile) throws IOException {
        return new String(Files.readAllBytes(outputFile), StandardCharsets.UTF_8);
    }

    private boolean containsLine(String output, String expected) {
        String normalized = output.replace("\r\n", "\n").replace('\r', '\n');
        return Arrays.asList(normalized.split("\n")).contains(expected);
    }

    private void check(boolean condition, String message) {
        assertions++;
        if (!condition) {
            throw new AssertionError(message);
        }
    }

    private static void deleteTree(Path root) throws IOException {
        if (!Files.exists(root)) {
            return;
        }
        Files.walkFileTree(root, new SimpleFileVisitor<Path>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attributes)
                    throws IOException {
                Files.deleteIfExists(file);
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult postVisitDirectory(Path directory, IOException error)
                    throws IOException {
                if (error != null) {
                    throw error;
                }
                Files.deleteIfExists(directory);
                return FileVisitResult.CONTINUE;
            }
        });
    }

    private static final class RunningProcess {
        private final Process process;
        private final Path outputFile;

        private RunningProcess(Process process, Path outputFile) {
            this.process = process;
            this.outputFile = outputFile;
        }
    }

    private static final class HeldProcess {
        private final Process process;
        private final Path readyFile;

        private HeldProcess(Process process, Path readyFile) {
            this.process = process;
            this.readyFile = readyFile;
        }
    }

    private static final class ProcessResult {
        private final int exitCode;
        private final String output;

        private ProcessResult(int exitCode, String output) {
            this.exitCode = exitCode;
            this.output = output;
        }
    }
}
