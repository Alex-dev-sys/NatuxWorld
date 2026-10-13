import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;

public final class JavaFileLockProbe {
    public static void main(String[] args) throws Exception {
        Path path = Paths.get(args[1]);
        long position = "probe-adjacent".equals(args[0]) ? 1L : 0L;
        try (FileChannel channel = FileChannel.open(
                path, StandardOpenOption.CREATE, StandardOpenOption.READ, StandardOpenOption.WRITE)) {
            FileLock lock = channel.tryLock(position, 1L, false);
            if (lock == null) {
                System.out.println("BUSY");
                System.out.flush();
                System.exit(3);
            }
            if (args[0].startsWith("probe")) {
                System.out.println("ACQUIRED");
                System.out.flush();
                lock.release();
                return;
            }
            System.out.println("LOCKED");
            System.out.flush();
            BufferedReader input = new BufferedReader(new InputStreamReader(System.in));
            input.readLine();
            lock.release();
        }
    }
}
