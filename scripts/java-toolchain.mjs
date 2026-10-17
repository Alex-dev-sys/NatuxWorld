import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export function javaToolchain() {
  let javaHome = process.env.JAVA_HOME?.trim();
  if (!javaHome) {
    const result = spawnSync('java', ['-XshowSettings:properties', '-version'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    javaHome = /^\s*java\.home\s*=\s*(.+?)\s*$/m.exec(output)?.[1]?.trim();
    if (result.error || !javaHome) {
      throw new Error('A JDK is required: java, javac, and jar must be available.');
    }
  }

  const executableSuffix = process.platform === 'win32' ? '.exe' : '';
  const binDirectory = path.join(javaHome, 'bin');
  const tool = (name) => {
    const executable = path.join(binDirectory, `${name}${executableSuffix}`);
    if (!existsSync(executable)) throw new Error(`JDK tool is missing: ${executable}`);
    return executable;
  };

  return {
    home: javaHome,
    java: tool('java'),
    javac: tool('javac'),
    jar: tool('jar'),
  };
}
