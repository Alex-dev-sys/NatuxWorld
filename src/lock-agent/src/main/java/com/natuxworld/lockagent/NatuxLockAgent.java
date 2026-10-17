package com.natuxworld.lockagent;

import java.io.IOException;
import java.lang.instrument.Instrumentation;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;

/** Acquires the game lock before the application main method. */
public final class NatuxLockAgent {
    public static final String READY_LINE = "NATUX_LOCK_READY_V1";

    private static volatile FileChannel retainedGameChannel;
    private static volatile FileLock retainedGameLock;

    private NatuxLockAgent() {
    }

    public static void premain(String agentArgs, Instrumentation instrumentation) {
        FileChannel gameChannel = null;
        FileLock gameLock = null;
        boolean retainGameLock = false;

        try {
            String configuredProfile = System.getenv("NATUX_PROFILE_DIR");
            if (configuredProfile == null || configuredProfile.trim().isEmpty()) {
                throw new IllegalStateException("NATUX_PROFILE_DIR is required");
            }

            Path userData = Paths.get(configuredProfile).toAbsolutePath().normalize();
            Files.createDirectories(userData);

            Path gamePath = userData.resolve(".game.lock");
            gameChannel = openLockChannel(gamePath);
            gameLock = gameChannel.tryLock(0L, 1L, false);
            if (gameLock == null) {
                throw new IllegalStateException("game lock is already held");
            }

            retainedGameChannel = gameChannel;
            retainedGameLock = gameLock;
            gameChannel = null;
            gameLock = null;
            retainGameLock = true;

            System.out.println(READY_LINE);
            System.out.flush();
        } catch (Throwable failure) {
            throw new IllegalStateException(
                    "Natux lock acquisition failed; refusing to start", failure);
        } finally {
            if (!retainGameLock) {
                releaseQuietly(gameLock);
                closeQuietly(gameChannel);
            }
        }
    }

    private static FileChannel openLockChannel(Path path) throws IOException {
        return FileChannel.open(path,
                StandardOpenOption.CREATE,
                StandardOpenOption.READ,
                StandardOpenOption.WRITE,
                LinkOption.NOFOLLOW_LINKS);
    }

    private static void releaseQuietly(FileLock lock) {
        if (lock != null) {
            try {
                lock.release();
            } catch (IOException ignored) {
                // Closing the channel below also releases any remaining lock.
            }
        }
    }

    private static void closeQuietly(FileChannel channel) {
        if (channel != null) {
            try {
                channel.close();
            } catch (IOException ignored) {
                // Startup is already failing; retain the original failure.
            }
        }
    }
}
