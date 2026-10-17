# Launcher packaging resources

Run `npm run prepare:icons` to prepare the Electron resources in this directory:

- `icon.png` is copied from the tracked renderer asset `public/icon.png` and is
  used for macOS and Linux packaging.
- `icon.ico` is copied from the tracked Windows icon `src/native/icons/icon.ico`
  and is used for Windows, including the NSIS installer.

The script checks each input file signature before writing either output. The tracked
Tauri artwork remains in `src/native/icons/`: Tauri uses its PNG, ICO, and ICNS
files directly. These source variants intentionally retain their current artwork;
the preparation step synchronizes packaging copies without converting or
redesigning them.

`npm run build`, `npm run build:web`, `npm run build:tauri:web`, and
`npm run electron:build:web` run the preparation step before building. Run
`npm run test:icons` to check that signatures are validated and files are copied correctly.

The default desktop is Tauri/Rust. `lock-runtime/` contains the generated Java lock agent required by installed and portable Tauri packages; Electron rollback also uses the generated native lock helper. Electron artwork copies remain available for the optional rollback subpackage and do not add Electron to the Tauri distribution.

`npm run build:portable` creates the Windows x64 ZIP with `Start NATUX WORLD.cmd` and `start-portable.ps1`. The helper checks WebView2 and offers installation only when missing, after verifying Microsoft Authenticode. `npm run test:portable` checks startup and relocation of the portable profile. A clean-machine WebView2 installation still requires acceptance.
