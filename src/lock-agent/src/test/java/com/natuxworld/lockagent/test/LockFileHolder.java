package com.natuxworld.lockagent.test;

import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;

/** Holds one lock from a separate JVM until the test harness closes stdin. */
public final class LockFileHolder {
    private LockFileHolder() {
    }

    public static void main(String[] args) throws Exception {
        Path lockPath = Paths.get(args[0]);
        Path readyPath = Paths.get(args[1]);
        Files.createDirectories(lockPath.getParent());
        FileChannel channel = FileChannel.open(lockPath,
                StandardOpenOption.CREATE,
                StandardOpenOption.READ,
                StandardOpenOption.WRITE);
        FileLock lock = channel.tryLock(0L, 1L, false);
        if (lock == null) {
            channel.close();
            throw new IllegalStateException("test holder could not acquire " + lockPath);
        }
        try {
            Files.write(readyPath, new byte[] { 1 });
            System.in.read();
        } finally {
            lock.release();
            channel.close();
        }
    }
}
