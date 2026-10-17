package com.natuxworld.lockagent.test;

/** Application stand-in used to prove the agent runs before application startup. */
public final class LockAgentTestApp {
    private LockAgentTestApp() {
    }

    public static void main(String[] args) throws Exception {
        System.out.println("APPLICATION_MAIN_REACHED");
        System.out.flush();
        if (args.length > 0 && "hold".equals(args[0])) {
            while (System.in.read() != -1) {
                // Keep the JVM alive until the test harness closes stdin.
            }
        }
    }
}
