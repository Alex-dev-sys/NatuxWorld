const fs = require('fs');
const path = require('path');
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} = require('docx');

const root = path.resolve(__dirname, '..');
const outputPath = path.join(root, 'docs', 'NatuxWorld_проект_10_класс.docx');
const iconPath = path.join(root, 'public', 'icon.png');

const colors = {
  red: 'C00000',
  dark: '202124',
  gray: '666666',
  light: 'F2F2F2',
  border: 'B7B7B7',
};

const normalRun = (text, options = {}) => new TextRun({
  text,
  font: 'Times New Roman',
  size: 28,
  ...options,
});

const body = (text, options = {}) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED,
  spacing: { after: 140, line: 360 },
  children: [normalRun(text, options)],
});

const centered = (text, options = {}) => new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: options.after ?? 140, line: options.line ?? 360 },
  children: [normalRun(text, options)],
});

const heading = (text, level = HeadingLevel.HEADING_1) => new Paragraph({
  heading: level,
  spacing: { before: 240, after: 140 },
  children: [normalRun(text, { bold: true, color: colors.red })],
});

const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

const bullet = (text) => new Paragraph({
  numbering: { reference: 'bullet-list', level: 0 },
  spacing: { after: 90, line: 330 },
  children: [normalRun(text)],
});

const numbered = (text) => new Paragraph({
  numbering: { reference: 'number-list', level: 0 },
  spacing: { after: 90, line: 330 },
  children: [normalRun(text)],
});

const cell = (text, options = {}) => new TableCell({
  width: { size: options.width || 3000, type: WidthType.DXA },
  shading: options.header ? { fill: colors.red, type: ShadingType.CLEAR } : undefined,
  margins: { top: 100, bottom: 100, left: 120, right: 120 },
  children: [new Paragraph({
    alignment: options.align || AlignmentType.LEFT,
    spacing: { after: 0, line: 300 },
    children: [normalRun(text, {
      bold: options.header || options.bold,
      color: options.header ? 'FFFFFF' : colors.dark,
      size: options.size || 24,
    })],
  })],
});

const table = (rows, widths) => new Table({
  width: { size: widths.reduce((sum, width) => sum + width, 0), type: WidthType.DXA },
  columnWidths: widths,
  borders: {
    top: { style: BorderStyle.SINGLE, size: 4, color: colors.border },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: colors.border },
    left: { style: BorderStyle.SINGLE, size: 4, color: colors.border },
    right: { style: BorderStyle.SINGLE, size: 4, color: colors.border },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: colors.border },
    insideVertical: { style: BorderStyle.SINGLE, size: 4, color: colors.border },
  },
  rows: rows.map((row, rowIndex) => new TableRow({
    children: row.map((value, columnIndex) => value instanceof TableCell
      ? value
      : cell(value, { width: widths[columnIndex], header: rowIndex === 0 })),
  })),
});

const source = (title, url) => new Paragraph({
  spacing: { after: 100, line: 300 },
  children: [normalRun(`${title}. `), new TextRun({
    text: url,
    font: 'Times New Roman',
    size: 24,
    color: '0563C1',
    underline: {},
  })],
});

const children = [];

// Титульный лист
if (fs.existsSync(iconPath)) {
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 220 },
    children: [new ImageRun({
      type: 'png',
      data: fs.readFileSync(iconPath),
      transformation: { width: 105, height: 105 },
    })],
  }));
}
children.push(centered('[Название образовательной организации]', { bold: true, size: 28, after: 80 }));
children.push(centered('[Класс: 10 ___]', { size: 26, after: 700 }));
children.push(centered('ИНДИВИДУАЛЬНЫЙ ПРОЕКТ', { bold: true, size: 34, color: colors.red, after: 240 }));
children.push(centered('по информатике', { italic: true, size: 30, after: 420 }));
children.push(centered('«Разработка цифровой экосистемы', {
  bold: true,
  size: 34,
  after: 40,
}));
children.push(centered('Minecraft-сервера NATUX WORLD»', {
  bold: true,
  size: 34,
  line: 420,
  after: 900,
}));
children.push(centered('Выполнил(а): [ФИО ученика]', { size: 26, after: 80 }));
children.push(centered('Руководитель: [ФИО руководителя]', { size: 26, after: 700 }));
children.push(centered('[Город]', { size: 26, after: 60 }));
children.push(centered('2026', { size: 26, after: 0 }));

children.push(pageBreak());

// Содержание
children.push(heading('Содержание'));
[
  'Введение',
  '1. Теоретическая часть',
  '2. Практическая часть',
  '3. Результаты проекта и рекомендации',
  'Заключение',
  'Список использованных источников',
  'Приложение. Краткая инструкция пользователя',
].forEach((item, index) => children.push(new Paragraph({
  spacing: { after: 100, line: 330 },
  children: [normalRun(item === 'Введение' || item === 'Заключение' || item.startsWith('Список') || item.startsWith('Приложение')
    ? item
    : item, { bold: index > 0 && index < 4 })],
})));

children.push(pageBreak());

// Введение
children.push(heading('Введение'));
children.push(body('Современные компьютерные игры постепенно превращаются в полноценные цифровые сообщества. Игроку важно не только войти в игру, но и быстро установить нужные файлы, зарегистрироваться, узнать новости проекта, приобрести дополнительные возможности и получить помощь. Если все эти действия разнесены по разным сайтам и выполняются вручную, пользователь сталкивается с лишними сложностями.'));
children.push(body('В качестве практического примера в работе рассматривается NATUX WORLD — проект Minecraft-сервера, объединяющий настольный лаунчер, сайт с аккаунтами и магазином, а также серверный плагин. Основная идея проекта состоит в том, чтобы сделать путь игрока от установки игры до подключения к серверу максимально понятным и автоматизированным.'));

children.push(heading('Актуальность проекта', HeadingLevel.HEADING_2));
children.push(body('Актуальность темы связана с тем, что пользователи ожидают от цифровых продуктов простого интерфейса, автоматической установки и безопасной работы. Изучение такого проекта позволяет на практическом примере познакомиться с веб-разработкой, созданием настольных приложений, базами данных, тестированием и вопросами информационной безопасности.'));

children.push(heading('Проблема', HeadingLevel.HEADING_2));
children.push(body('Как объединить лаунчер, сайт и Minecraft-сервер в одну систему, чтобы игрок мог зарегистрироваться, установить необходимые компоненты и подключиться к игре с минимальным количеством ручных действий?'));

children.push(heading('Цель проекта', HeadingLevel.HEADING_2));
children.push(body('Исследовать устройство и возможности цифровой экосистемы NATUX WORLD, а также описать принципы создания удобного и безопасного лаунчера для Minecraft-сервера.'));

children.push(heading('Задачи проекта', HeadingLevel.HEADING_2));
[
  'изучить назначение лаунчера, сайта и серверного плагина;',
  'определить, как взаимодействуют основные части системы;',
  'рассмотреть используемые технологии: Electron, React, TypeScript, Next.js, PostgreSQL и Paper;',
  'описать пользовательский сценарий: регистрация, установка и запуск игры;',
  'проанализировать меры безопасности и способы проверки работоспособности;',
  'сформулировать результаты и рекомендации по дальнейшему развитию проекта.',
].forEach((item) => children.push(numbered(item)));

children.push(heading('Объект и предмет исследования', HeadingLevel.HEADING_2));
children.push(body('Объект исследования — цифровая инфраструктура Minecraft-сервера. Предмет исследования — взаимодействие лаунчера, сайта, API и серверного плагина в единой системе.'));

children.push(heading('Гипотеза', HeadingLevel.HEADING_2));
children.push(body('Если объединить установку игры, авторизацию, новости и запуск Minecraft в одном лаунчере, то вход нового игрока на сервер станет быстрее и понятнее, а количество ручных действий и ошибок уменьшится.'));

children.push(heading('Методы', HeadingLevel.HEADING_2));
['анализ исходного кода и проектной документации;', 'изучение пользовательского сценария;', 'сравнение функций отдельных модулей;', 'анализ результатов автоматических тестов;', 'обобщение полученных результатов.'].forEach((item) => children.push(bullet(item)));

children.push(pageBreak());

// Теоретическая часть
children.push(heading('1. Теоретическая часть'));
children.push(heading('1.1. Что такое цифровая экосистема', HeadingLevel.HEADING_2));
children.push(body('Цифровая экосистема — это набор связанных программ и сервисов, которые работают вместе и обслуживают общий пользовательский сценарий. В рассматриваемом проекте экосистема состоит из трёх основных частей: клиентского приложения-лаунчера, сайта с серверной частью и плагина, установленного на Minecraft-сервере.'));

children.push(heading('1.2. Назначение лаунчера', HeadingLevel.HEADING_2));
children.push(body('Лаунчер — это программа, которая подготавливает игровую среду и запускает игру. Хороший лаунчер должен проверять наличие Java, загружать нужную версию Minecraft и модификаций, хранить настройки пользователя, показывать статус установки и сообщать об ошибках. В NATUX WORLD лаунчер также используется для авторизации, новостей, диагностики и подключения к серверу одной кнопкой.'));

children.push(heading('1.3. Используемые технологии', HeadingLevel.HEADING_2));
children.push(table([
  ['Технология', 'Назначение в проекте'],
  ['Electron', 'Создание настольного приложения для Windows и macOS.'],
  ['React', 'Разработка интерфейса лаунчера из переиспользуемых компонентов.'],
  ['TypeScript', 'Типизация кода и уменьшение количества ошибок при разработке.'],
  ['Next.js', 'Создание сайта, API и административной панели.'],
  ['PostgreSQL и Prisma', 'Хранение данных пользователей, заказов, новостей и статистики.'],
  ['Paper и Java', 'Разработка серверного плагина для Minecraft.'],
], [2800, 6500]));

children.push(heading('1.4. Требования к системе', HeadingLevel.HEADING_2));
['понятный интерфейс для пользователя без специальных технических знаний;', 'автоматическая установка или проверка необходимых компонентов;', 'защита аккаунта и передаваемых данных;', 'устойчивость к ошибкам загрузки и временным сбоям сети;', 'возможность обновлять приложение и добавлять новые функции.'].forEach((item) => children.push(bullet(item)));

children.push(pageBreak());

// Практическая часть
children.push(heading('2. Практическая часть'));
children.push(heading('2.1. Архитектура проекта', HeadingLevel.HEADING_2));
children.push(body('Взаимодействие компонентов можно представить следующим образом: игрок работает с лаунчером; лаунчер обращается к сайту и API для регистрации, входа и получения данных; затем запускает Minecraft и подключает его к серверу; серверный плагин собирает игровые события и при необходимости передаёт статистику обратно в API.'));
children.push(table([
  ['Участник системы', 'Основная роль', 'Результат взаимодействия'],
  ['Игрок', 'Регистрируется, настраивает игру и запускает сервер.', 'Получает удобный вход в игровой мир.'],
  ['Лаунчер', 'Устанавливает компоненты, хранит настройки и запускает Minecraft.', 'Сокращает число ручных действий.'],
  ['Сайт и API', 'Хранят аккаунты, новости, заказы и данные сервера.', 'Обеспечивают единую учётную запись и управление.'],
  ['Minecraft-сервер и плагин', 'Обрабатывают игровые события и игровые команды.', 'Поддерживают работу игрового сообщества.'],
], [2350, 3600, 3350]));

children.push(heading('2.2. Основной пользовательский сценарий', HeadingLevel.HEADING_2));
[
  'Пользователь скачивает установщик NATUX WORLD.',
  'После запуска регистрируется или входит в уже созданный аккаунт.',
  'Лаунчер проверяет наличие Java 21, Minecraft и Forge 1.21.1.',
  'Недостающие компоненты загружаются, а их целостность проверяется по хешам.',
  'Пользователь нажимает кнопку «Играть».',
  'Minecraft запускается и подключается к серверу.',
].forEach((item) => children.push(numbered(item)));

children.push(heading('2.3. Функции лаунчера', HeadingLevel.HEADING_2));
children.push(table([
  ['Функция', 'Практическая польза'],
  ['Установка Java и игры', 'Новый игрок не ищет файлы вручную и получает готовое окружение.'],
  ['Авторизация', 'Аккаунт сайта используется для входа в лаунчер и игру.'],
  ['Настройки', 'Можно выбрать память, Java, разрешение, полноэкранный режим и JVM-параметры.'],
  ['Логи и диагностика', 'Пользователь видит ход установки и может быстрее найти причину ошибки.'],
  ['Обновления', 'Новая версия лаунчера доставляется с проверкой подписи и контрольных сумм.'],
], [3000, 6300]));

children.push(heading('2.4. Безопасность', HeadingLevel.HEADING_2));
children.push(body('Безопасность особенно важна для проекта, который работает с аккаунтами и покупками. В документации проекта описаны изоляция контекста Electron, Content Security Policy, проверка загружаемых файлов, хранение токенов через системное защищённое хранилище, хеширование паролей и двухфакторная аутентификация для административной части.'));
children.push(body('Отдельное внимание уделяется обновлениям: перед установкой проверяются версия, имя файла, хеш и криптографическая подпись манифеста. Это уменьшает риск установки повреждённого или подменённого файла.'));

children.push(heading('2.5. Тестирование', HeadingLevel.HEADING_2));
children.push(body('Для проверки проекта используются автоматические тесты. Они проверяют сервисы лаунчера, настройки, работу с Java и Minecraft, обновления, пути к файлам и отдельные функции интерфейса. По данным README проекта, в текущей версии заявлены 106 тестов лаунчера и 167 тестов сайта. Эти числа показывают, что разработчики проверяют не только внешний вид, но и внутреннюю логику.'));
children.push(table([
  ['Проверяемая область', 'Пример проверки'],
  ['Установка', 'Корректная загрузка и обработка ошибки повреждённого файла.'],
  ['Авторизация', 'Создание аккаунта и обработка неверных данных.'],
  ['Настройки', 'Сохранение памяти, разрешения и выбранной версии Java.'],
  ['Обновления', 'Проверка подписи манифеста и запрет неподходящего файла.'],
  ['Работа сервисов', 'Корректная реакция на сбой сети и повторные попытки.'],
], [3000, 6300]));

children.push(pageBreak());

// Результаты
children.push(heading('3. Результаты проекта и рекомендации'));
children.push(heading('3.1. Полученные результаты', HeadingLevel.HEADING_2));
children.push(body('В ходе работы была рассмотрена структура проекта NATUX WORLD и описано, как отдельные программы объединяются в единую экосистему. Установлено, что лаунчер решает сразу несколько задач: устанавливает игровое окружение, обеспечивает вход пользователя, показывает информацию о сервере и запускает Minecraft. Сайт дополняет лаунчер аккаунтами, магазином и административными инструментами, а серверный плагин связывает игровые события с серверной частью.'));
children.push(body('Таким образом, гипотеза подтверждается: единый лаунчер действительно способен уменьшить количество ручных действий пользователя и сделать первое подключение к серверу более понятным. Однако качество результата зависит от стабильности сети, корректно настроенного сервера и регулярного тестирования обновлений.'));

children.push(heading('3.2. Практическая ценность', HeadingLevel.HEADING_2));
['проект может использоваться как пример комплексной разработки на стыке веб-программирования и создания настольных приложений;', 'структура проекта помогает разделять интерфейс, бизнес-логику и серверные функции;', 'автоматизация загрузки и обновления снижает количество типичных ошибок новичков;', 'набор тестов облегчает сопровождение и дальнейшее развитие системы.'].forEach((item) => children.push(bullet(item)));

children.push(heading('3.3. Рекомендации по развитию', HeadingLevel.HEADING_2));
['подготовить отдельный режим для демонстрации проекта без подключения к реальному игровому серверу;', 'добавить пошаговые подсказки для первого запуска и восстановления после сбоя;', 'проводить регулярные проверки производительности и доступности API;', 'расширить пользовательскую документацию скриншотами и ответами на частые вопросы;', 'сохранять принцип минимального сбора данных и информировать пользователя о телеметрии.'].forEach((item) => children.push(bullet(item)));

children.push(pageBreak());

children.push(heading('Заключение'));
children.push(body('В рамках индивидуального проекта была исследована цифровая экосистема NATUX WORLD — проект Minecraft-сервера, включающий лаунчер, сайт и серверный плагин. Были рассмотрены цель, задачи, архитектура, пользовательский сценарий, используемые технологии, меры безопасности и подход к тестированию.'));
children.push(body('Главный вывод состоит в том, что удобство цифрового продукта определяется не одной красивой страницей, а согласованной работой всех компонентов. Если регистрация, установка, обновления и запуск объединены в понятный сценарий, пользователю проще начать работу, а разработчику — сопровождать систему.'));
children.push(body('Работа показала, что создание подобного проекта требует знаний сразу в нескольких областях: программирования, проектирования интерфейсов, сетевого взаимодействия, хранения данных и информационной безопасности. Поэтому NATUX WORLD может служить наглядным примером комплексного IT-проекта и основой для дальнейшего изучения разработки программного обеспечения.'));

children.push(heading('Список использованных источников'));
children.push(source('1. Репозиторий проекта NATUX WORLD. Файл README.md', 'локальные материалы проекта'));
children.push(source('2. Документация проекта. Папка docs', 'локальные материалы проекта'));
children.push(source('3. Electron Documentation', 'https://www.electronjs.org/docs/latest/'));
children.push(source('4. React Documentation', 'https://react.dev/learn'));
children.push(source('5. TypeScript Documentation', 'https://www.typescriptlang.org/docs/'));
children.push(source('6. Minecraft Paper Documentation', 'https://docs.papermc.io/'));

children.push(pageBreak());

children.push(heading('Приложение. Краткая инструкция пользователя'));
children.push(heading('Как начать игру', HeadingLevel.HEADING_2));
[
  'Скачать установщик с официальной страницы проекта.',
  'Установить лаунчер и запустить его.',
  'Создать аккаунт или войти в существующий.',
  'Дождаться завершения проверки и установки компонентов.',
  'Нажать кнопку «Играть».',
].forEach((item) => children.push(numbered(item)));
children.push(heading('Если возникла ошибка', HeadingLevel.HEADING_2));
['проверить подключение к Интернету;', 'открыть раздел логов и диагностики;', 'не удалять файлы игры во время обновления;', 'при повторяющейся ошибке передать отчёт об ошибке администратору проекта.'].forEach((item) => children.push(bullet(item)));
children.push(heading('Структура исходного проекта', HeadingLevel.HEADING_2));
children.push(table([
  ['Папка', 'Содержание'],
  ['src/', 'Интерфейс лаунчера на React.'],
  ['electron/', 'Основной процесс Electron, IPC и сервисы.'],
  ['website/', 'Сайт, API, база данных и серверный плагин.'],
  ['tests/', 'Интеграционные и end-to-end тесты.'],
  ['docs/', 'Документация, аудиты и проектные материалы.'],
], [2400, 6900]));

const doc = new Document({
  creator: 'NATUX WORLD',
  title: 'Разработка цифровой экосистемы Minecraft-сервера NATUX WORLD',
  subject: 'Индивидуальный проект по информатике для 10 класса',
  keywords: 'NATUX WORLD, Minecraft, проект, информатика, лаунчер',
  language: 'ru-RU',
  numbering: {
    config: [
      {
        reference: 'bullet-list',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT }],
      },
      {
        reference: 'number-list',
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT }],
      },
    ],
  },
  styles: {
    default: {
      document: {
        run: { font: 'Times New Roman', size: 28, color: colors.dark },
        paragraph: { spacing: { line: 360, after: 140 } },
      },
      title: { run: { font: 'Times New Roman', size: 34, bold: true, color: colors.red } },
      heading1: { run: { font: 'Times New Roman', size: 32, bold: true, color: colors.red } },
      heading2: { run: { font: 'Times New Roman', size: 29, bold: true, color: colors.dark } },
    },
  },
  sections: [{
    properties: {
      page: {
        margin: { top: 1134, bottom: 1134, left: 1417, right: 1134 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [normalRun('NATUX WORLD · индивидуальный проект', { size: 18, color: colors.gray, italic: true })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [normalRun('Страница ', { size: 20, color: colors.gray }), new TextRun({ children: [PageNumber.CURRENT], font: 'Times New Roman', size: 20, color: colors.gray })],
        })],
      }),
    },
    children,
  }],
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outputPath, buffer);
  console.log(`Created ${outputPath}`);
});
