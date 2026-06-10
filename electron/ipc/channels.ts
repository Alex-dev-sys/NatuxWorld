export const IPC = {
  WINDOW: {
    MINIMIZE: 'window:minimize',
    MAXIMIZE: 'window:maximize',
    CLOSE: 'window:close',
    IS_MAXIMIZED: 'window:isMaximized',
    MAXIMIZED_CHANGE: 'window:maximized',
  },
  LAUNCHER: {
    PLAY: 'launcher:play',
    GET_STATUS: 'launcher:getStatus',
    PROGRESS: 'launcher:progress',
    LOG: 'launcher:log',
    CANCEL: 'launcher:cancel',
  },
  AUTH: {
    LOGIN: 'auth:login',
    LOGOUT: 'auth:logout',
    GET_USER: 'auth:getUser',
  },
  JAVA: {
    DETECT: 'java:detect',
    INSTALL: 'java:install',
  },
  NEWS: {
    GET_ALL: 'news:getAll',
  },
  SERVER: {
    GET_STATUS: 'server:getStatus',
    GET_INFO: 'server:getInfo',
  },
  SETTINGS: {
    GET: 'settings:get',
    SET: 'settings:set',
    GET_SYSTEM_MEMORY: 'settings:getSystemMemory',
    RESET: 'settings:reset',
    PICK_JAVA: 'settings:pickJava',
    VERIFY_JAVA: 'settings:verifyJava',
  },
  UPDATER: {
    CHECK: 'updater:check',
    INSTALL: 'updater:install',
    EVENT: 'updater:event',
  },
  SHELL: {
    OPEN_EXTERNAL: 'shell:openExternal',
  },
  ACCOUNT: {
    BOOTSTRAP: 'account:bootstrap',
    REGISTER: 'account:register',
    VERIFY: 'account:verify',
    RESEND: 'account:resend',
    LOGIN: 'account:login',
    LOGOUT: 'account:logout',
  },
} as const;
