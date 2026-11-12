/**
 * Тексты сайта на двух языках. Русская версия — основная, английская открывается по адресу /en.
 * Чтобы поправить формулировку, достаточно изменить строку здесь.
 */
import type { ReactNode } from "react";
import { abroadAreaText } from "@/config/cdek-countries";
import { KIT, WHOLESALE } from "@/config/products";
import { PRODUCT } from "@/config/site";
import { formatNumber } from "@/lib/format";
import type { Lang } from "./lang";

const n = (v: number, lang: Lang) => formatNumber(v, lang);

const ru = {
  header: {
    skip: "Перейти к содержимому",
    home: "Kamui × Iosif Abramov — на главную",
    mainNav: "Основное меню",
    mobileNav: "Мобильное меню",
    nav: [
      { hash: "collection", label: "Коллекция" },
      { hash: "features", label: "Преимущества" },
      { hash: "story", label: "История" },
      { hash: "gallery", label: "Галерея" },
      { hash: "kit", label: "Набор" },
    ],
    left: "Осталось",
    buy: "Купить",
    openMenu: "Открыть меню",
    closeMenu: "Закрыть меню",
    mobileStock: (left: number, total: number) =>
      `Лимитированная серия · осталось ${n(left, "ru")} из ${n(total, "ru")}`,
    switchLabel: "English version",
    switchShort: "EN",
  },
  hero: {
    sliderAria: "Фотографии коллекции Kamui × Iosif Abramov",
    eyebrow: "Лимитированная серия мела",
    pieces: (total: number) => `${n(total, "ru")} экземпляров`,
    cta: "Оставить заявку",
    price: "Цена",
    trustAria: "Почему у нас",
    trust: ["Выбор чемпиона мира", "Гарантия качества 100%", "Официальный дистрибьютор в СНГ"],
  },
  collection: {
    label: "Коллекция",
    title: (
      <>
        Не расходник.
        <br />
        <span className="red">Экземпляр</span> коллекции.
      </>
    ),
    lead1: (
      <>
        <strong>Kamui × Iosif Abramov</strong> — лимитированная серия бильярдного мела Kamui (Камуи), созданная
        вместе с Иосифом Абрамовым для игроков, которые чувствуют разницу между обычным ударом и идеальным контролем.
      </>
    ),
    lead2:
      "Каждый экземпляр объединяет японские технологии Kamui и опыт Иосифа Абрамова — многократного чемпиона мира по русскому бильярду.",
    total: (total: number) => (
      <>
        Всего создано <b>{n(total, "ru")}</b> экземпляров.
      </>
    ),
    editionTerm: "Тираж",
    editionUnit: "экземпляров во всей серии",
    availableTerm: "Доступно сейчас",
    availableUnit: (sold: number) => `осталось · продано ${n(sold, "ru")}`,
    madeTerm: "Производство",
    madeUnit: "технологии Kamui",
    modelTerm: "Модель",
  },
  features: {
    label: "Преимущества",
    title: (
      <>
        Точность <span className="red">в деталях</span>
      </>
    ),
    cards: [
      {
        title: "Контроль",
        body: <p>Надёжное сцепление наклейки с шаром — стабильный контакт и уверенность в каждом ударе.</p>,
      },
      {
        title: "Чистота игры",
        body: (
          <>
            <p>Мы решили одну из главных проблем обычного мела:</p>
            <ul>
              <li>меньше следов на столе;</li>
              <li>меньше загрязнения кия;</li>
              <li>более аккуратное использование.</li>
            </ul>
          </>
        ),
      },
      {
        title: "Коллекция",
        body: <p>Каждый мел является частью ограниченного выпуска Kamui × Iosif Abramov.</p>,
      },
    ] as { title: string; body: ReactNode }[],
    grip: {
      eyebrow: "Сцепление",
      title: (
        <>
          Один из лучших мелов <span className="red">по сцеплению</span>
        </>
      ),
      text: "Kamui 0.98 β надёжно держит наклейку на шаре: удар за ударом контакт остаётся одинаковым, кий не соскальзывает даже при сильном винте. Этот мел создан вместе с Иосифом Абрамовым — многократным чемпионом мира по русскому бильярду.",
      topLines: ["Выбор", "чемпиона", "мира"],
      topLabel: "Выбор чемпиона мира",
      topCaption: "Создан вместе с чемпионом мира",
      sealRing: "Гарантия качества · Оригинал · Abramov Shop · ",
      sealCenter: "100%",
      sealSub: "гарантия",
      sealLabel: "Гарантия качества 100%",
      sealCaption: "Гарантия качества 100%",
    },
  },
  story: {
    label: "История создания",
    title: (
      <>
        Почему появился
        <br />
        этот мел
      </>
    ),
    problem: "Проблема",
    problemText: "Игроки хотели больше контроля, но обычный мел оставлял много следов.",
    solution: "Решение",
    solutionText: "Создать формулу, которая сочетает сцепление, стабильность и чистоту.",
    formula: [
      { term: "Сцепление", note: "уверенный контакт наклейки с шаром" },
      { term: "Стабильность", note: "предсказуемый удар от партии к партии" },
      { term: "Чистота", note: "меньше следов на сукне, руках и кие" },
    ],
  },
  official: {
    label: "Официальный магазин",
    title: (
      <>
        Официальный
        <br />
        <span className="gold">дистрибьютор</span>
      </>
    ),
    logo: "Abramov Shop",
    caption: "Abramov Shop · официальный дистрибьютор в СНГ",
    lead: (
      <>
        <strong>Abramov Shop</strong> — официальный дистрибьютор мела Kamui × Iosif Abramov 0.98 β в СНГ. Покупая
        здесь, вы получаете оригинальный экземпляр лимитированной серии.
      </>
    ),
    accent: "Официальная покупка с гарантией качества 100%.",
    points: [
      { title: "Официальный дистрибьютор в СНГ", text: "Мел поставляется официально — без посредников и перекупщиков." },
      { title: "Гарантия качества 100%", text: "Отвечаем за каждый экземпляр: оригинал из серии Kamui × Iosif Abramov." },
      { title: "Лимитированная серия", text: "Всего 2000 экземпляров — покупайте оригинал у официального дистрибьютора." },
    ],
  },
  kit: {
    label: "Подарочный набор",
    title: (
      <>
        Подарочный
        <br />
        <span className="gold">набор</span>
      </>
    ),
    lead: "Готовый подарок бильярдисту: всё для игры и для коллекции — в одной коробке.",
    stageAria: "Анимация: салфетка, фото с автографом, мел и наклейка JOS укладываются в коробку",
    photoAlt:
      "Подарочный набор Kamui × Iosif Abramov в открытой коробке: салфетка «Чемпион», фото с автографом Иосифа Абрамова в конверте, мел 0.98 β и наклейка JOS",
    itemsAria: "Что в наборе",
    items: [
      { title: "Салфетка «Чемпион»", text: "С вышивкой бильярдного клуба «Чемпион» — для кия и шаров." },
      { title: "Фото с автографом Иосифа Абрамова", text: "Фотография с личной подписью многократного чемпиона мира — в конверте." },
      { title: "Мел Kamui × Iosif Abramov 0.98 β", text: "Экземпляр лимитированной серии в фирменной упаковке." },
      { title: "Наклейка JOS на выбор", text: "Жёсткость на выбор: M, H, H+, PM, PH или PRO. Упакована в zip-пакет." },
    ],
    priceLabel: "Цена набора",
    tipsLabel: "Наклейка JOS",
    cta: (tip: string) => (tip ? `Заказать набор с наклейкой ${tip}` : "Заказать набор"),
    replay: "Повторить анимацию",
  },
  gallery: {
    label: "Галерея",
    hint: "Нажмите на фото, чтобы открыть его во весь экран",
    open: (caption: string) => `Открыть фото: ${caption}`,
    dialog: "Просмотр фотографий",
    lightbox: "Фотографии коллекции",
    close: "Закрыть",
  },
  slider: {
    prev: "Предыдущее фото",
    next: "Следующее фото",
    slide: (i: number, count: number, caption: string) => `${i} из ${count}: ${caption}`,
    dot: (i: number, caption: string) => `Фото ${i}: ${caption}`,
  },
  stock: {
    soldOut: "Тираж распродан",
    left: "Осталось",
    ofTotal: (total: number) => `шт. из ${n(total, "ru")}`,
    meter: "Продано экземпляров",
    meterText: (sold: number, total: number) => `Продано ${sold} из ${total}`,
    note: (sold: number, total: number) => `Продано ${n(sold, "ru")} из ${n(total, "ru")} экземпляров`,
  },
  qty: {
    less: "Уменьшить количество",
    more: "Увеличить количество",
    pcs: (q: number) => `${q} шт.`,
  },
  purchase: {
    label: "Покупка",
    title: (
      <>
        Закрепите за собой
        <br />
        <span className="red">свой экземпляр</span>
      </>
    ),
  },
  order: {
    formAria: "Заявка на покупку",
    perPiece: "за 1 шт.",
    perKit: "за набор",
    productAria: "Что заказываете",
    chalkOption: "Мел",
    chalkOptionSub: "Limited Edition 0.98 β",
    /** «от 10 шт. — 3 000 ₽» — под ценой мела */
    wholesaleFrom: (min: number, price: string) => `от ${min} шт. — ${price}`,
    /** Подсказка у количества, пока оптовая цена не действует */
    wholesaleHint: (min: number, price: string) => `От ${min} шт. — по ${price} за мел`,
    wholesaleTake: (min: number) => `Взять ${min} шт.`,
    /** Оптовая цена действует */
    wholesaleOn: (min: number, saving: string) => `Оптовая цена от ${min} шт. — экономия ${saving}`,
    wholesaleBadge: "опт",
    kitOption: "Подарочный набор",
    kitOptionSub: "мел, фото с автографом, салфетка, наклейка JOS",
    kitName: "Подарочный набор",
    kitSub: "Kamui × Iosif Abramov",
    tipLabel: "Наклейка JOS",
    tipHint: "Выберите жёсткость — положим её в набор",
    goodsKit: "Подарочный набор",
    quantity: "Количество",
    goods: "Товар",
    total: "Итого",
    soldOut: "Тираж распродан",
    placeOrder: "Оформить заказ",
    request: "Оставить заявку",
    /** area — «по России, в Беларусь, Казахстан, Армению и Кыргызстан» (из включённых стран доставки) */
    notePay: (methods: string[], area: string) =>
      `Оплата онлайн при оформлении через ЮKassa${
        methods.length ? `: ${methods.join(", ").replace("Банковская карта", "банковская карта")}` : ""
      }. Доставка СДЭК до пункта выдачи ${area}.`,
    noteRequest: "Без предоплаты: после заявки мы свяжемся с вами, чтобы уточнить доставку и оплату.",
    destination: "Страна доставки",
    otherCountry: "Другая страна — заявка менеджеру",
    destinationHintRu: "СДЭК до пункта выдачи, оплата онлайн",
    destinationHintCdek: "СДЭК до пункта выдачи. Оплата онлайн в рублях",
    destinationHintRobokassa: "СДЭК до пункта выдачи. Цены в долларах, оплата картой через Robokassa",
    destinationHintOther: "Оставьте заявку — менеджер рассчитает международную доставку и свяжется с вами",
    abroadPay:
      "Оплата — в рублях. Если карта вашего банка не пройдёт, заказ всё равно сохранится: менеджер свяжется с вами и поможет с оплатой.",
    abroadPayRobokassa:
      "Оплата через Robokassa: подходят карты Visa, Mastercard и UnionPay зарубежных банков. Оплата проходит в рублях по курсу ЦБ — банк спишет сумму в валюте вашей карты по своему курсу.",
    /** Строка под суммой для заказов из-за рубежа */
    payInRub: (rub: string, rate: string) => `Спишется ${rub} по курсу ЦБ ${rate} за $1`,
    taxIdKz: "ИИН получателя",
    taxIdKzHint: "12 цифр, есть в удостоверении личности. Нужен для доставки в Казахстан",
    taxIdKg: "ПИН (ИНН) получателя",
    taxIdKgHint: "14 цифр, есть в паспорте. Нужен для доставки в Кыргызстан",
    noteRobokassa: "Заказы за пределы России оплачиваются через Robokassa — подходят карты зарубежных банков.",
    name: "ФИО",
    nameLatin: "ФИО латиницей",
    namePlaceholder: "Иванов Иван Иванович",
    nameLatinPlaceholder: "Ivanov Ivan",
    nameHint: "Как в паспорте — по нему СДЭК выдаёт посылку",
    nameLatinHint: "Как в загранпаспорте. Кириллица сразу переводится в латиницу",
    phone: "Телефон",
    email: "Email",
    country: "Страна",
    countryPlaceholder: "Например, Казахстан",
    city: "Город",
    cityPlaceholderRu: "Например, Краснодар",
    cityPlaceholderIntl: "Город",
    postalCode: "Индекс",
    postalPlaceholder: "Почтовый индекс",
    address: "Адрес",
    addressPlaceholder: "Улица, дом, квартира",
    comment: "Комментарий",
    commentPlaceholderRu: "Удобное время для звонка, пожелания по доставке",
    commentPlaceholderIntl: "Предпочтительная служба доставки, удобный мессенджер",
    consentBefore: "Я согласен на",
    consentLink: "обработку персональных данных",
    privacyLink: "Политика конфиденциальности",
    newsletter:
      "Согласен получать на почту письма о заказе: подтверждение оплаты и трек-номер СДЭК для отслеживания посылки. Рекламу не присылаем.",
    sending: "Отправляем…",
    toPayment: "Переходим к оплате…",
    pay: (sum: string) => `Перейти к оплате · ${sum}`,
    send: (q: number) => `Отправить заявку · ${q} шт.`,
    noteIntl: "Для заказов вне России стоимость и способ международной доставки рассчитываются индивидуально.",
    successTitle: "Заявка отправлена",
    successText: "Спасибо! Ваша заявка принята. Мы свяжемся с вами для уточнения доставки и оплаты.",
    noPaymentText:
      "Спасибо! Заявка принята, но онлайн-оплата сейчас недоступна. Мы свяжемся с вами, чтобы подтвердить заказ и выставить оплату.",
    orderNumber: "Номер заявки",
    checkMail: "Проверьте почту — и папку «Спам»: туда придут письма по заказу.",
    again: "Оформить ещё одну заявку",
    failed: "Не удалось отправить заявку. Попробуйте ещё раз.",
    offline: "Нет соединения. Проверьте интернет и попробуйте ещё раз.",
    otherVersion: null as null | { text: string; link: string; href: string },
    progress: {
      payTitle: "Готовим оплату",
      requestTitle: "Отправляем заявку",
      paySteps: ["Проверяем наличие и доставку", "Создаём заказ", "Готовим безопасную оплату", "Открываем страницу ЮKassa"],
      requestSteps: ["Проверяем наличие", "Сохраняем заявку"],
      usually: "Обычно это занимает несколько секунд",
      slow: "Чуть дольше обычного — не закрывайте и не обновляйте страницу",
      created: (id: string) => `Заказ ${id} создан`,
      secure: "Безопасная оплата · ЮKassa",
      notOpened: "Страница оплаты не открылась?",
      openPay: "Открыть оплату",
      timeout: "Сервер долго не отвечает. Проверьте интернет и нажмите кнопку ещё раз.",
    },
  },
  faq: {
    label: "Вопросы и ответы",
    title: (
      <>
        Мел Kamui ×
        <br />
        <span className="red">Иосиф Абрамов</span>
      </>
    ),
    /** Вопросы и ответы: тот же текст попадает в разметку FAQPage для Яндекса и Google */
    /** countries — страны доставки СДЭК, включённые на сайте (по умолчанию только Россия) */
    /** robokassa — заказы за пределы России оплачиваются через Robokassa */
    items: (
      price: string,
      countries: readonly string[] = ["RU"],
      robokassa = false,
      abroadPrice = "",
      kitPrice = `${n(KIT.price, "ru")} ₽`,
      /** Оптовая цена мела (от 10 шт.): в рублях и для заказов из-за рубежа */
      wholesale = `${n(WHOLESALE.price, "ru")} ₽`,
      abroadWholesale = "",
    ) => [
      {
        q: "Что такое мел Kamui × Iosif Abramov 0.98 β?",
        a: "Лимитированная серия бильярдного мела Kamui (Камуи), созданная вместе с Иосифом Абрамовым — многократным чемпионом мира по русскому бильярду. Мел сделан по японской технологии Kamui 0.98 β в линейке Pyramid. Весь тираж — 2000 экземпляров.",
      },
      {
        q: "Кто такой Иосиф Абрамов?",
        a: "Иосиф Абрамов — российский бильярдист, многократный чемпион мира по русскому бильярду. В 2026 году он выиграл чемпионат мира в дисциплине «Динамичная пирамида» в Самарканде. Его опыт лёг в основу этой серии мела Kamui.",
      },
      {
        q: "Подходит ли мел для русского бильярда (пирамиды)?",
        a: "Да. Мел выпущен в линейке Kamui Pyramid, рассчитанной на русский бильярд.",
      },
      {
        q: "Чем он отличается от обычного мела?",
        a: "Он надёжно держит наклейку на шаре и даёт предсказуемый удар от партии к партии, а следов на сукне, руках и кие остаётся меньше.",
      },
      {
        q: "Сколько стоит мел Kamui × Абрамов и где его купить?",
        a: `Цена — ${price} за 1 шт., при заказе от ${WHOLESALE.minQty} шт. — ${wholesale} за шт. Купить можно на этом сайте: выберите количество и пункт выдачи СДЭК и оплатите заказ онлайн. Тираж ограничен 2000 экземплярами, актуальный остаток показан на странице.`,
      },
      {
        q: "Есть ли оптовая цена?",
        a: `Да. Если в одном заказе от ${WHOLESALE.minQty} шт. мела, каждый стоит ${wholesale} вместо ${price}${
          abroadPrice && abroadWholesale ? ` (для заказов из-за рубежа — ${abroadWholesale} вместо ${abroadPrice})` : ""
        }. В одном заказе — до ${PRODUCT.maxPerOrder} шт. На подарочные наборы оптовая цена не распространяется.`,
      },
      {
        q: "Это оригинальный мел? Где купить его официально?",
        a: "Да. Abramov Shop — официальный дистрибьютор мела Kamui × Iosif Abramov 0.98 β в СНГ. Покупка на этом сайте — официальная, с гарантией качества 100%.",
      },
      {
        q: "Что входит в подарочный набор?",
        a: `Мел Kamui × Iosif Abramov 0.98 β, фото с автографом Иосифа Абрамова в конверте, салфетка бильярдного клуба «Чемпион» и наклейка JOS — жёсткость выбираете при заказе: M, H, H+, PM, PH или PRO. Всё в фирменной коробке. Цена набора — ${kitPrice}.`,
      },
      {
        q: "Как оплатить заказ?",
        a: `Онлайн при оформлении через ЮKassa: банковской картой, SberPay, ЮMoney и другими способами. Данные карты вводятся на странице ЮKassa и продавцу не передаются.${
          robokassa && abroadAreaText(countries)
            ? ` Заказы с доставкой ${abroadAreaText(countries)} оплачиваются через Robokassa — подходят карты Visa, Mastercard и UnionPay зарубежных банков.`
            : ""
        }`,
      },
      {
        q: "Как и когда доставят мел?",
        a: `Службой СДЭК до выбранного пункта выдачи — по всей России${
          abroadAreaText(countries) ? `, а также ${abroadAreaText(countries)}` : ""
        }. Отправляем из Краснодара в течение 1–3 рабочих дней после оплаты, стоимость и срок доставки сайт рассчитывает при оформлении.`,
      },
      {
        q: "Можно ли заказать из другой страны?",
        a: abroadAreaText(countries)
          ? `Да. ${abroadAreaText(countries).replace(/^в/, "В")} доставляем СДЭК до пункта выдачи, как по России: выберите страну в форме заказа, город и пункт выдачи — стоимость доставки рассчитается сразу.${
              robokassa
                ? ` Оплата онлайн через Robokassa, в том числе картами зарубежных банков.${
                    abroadPrice ? ` Цена для заказов из-за рубежа — ${abroadPrice} за 1 шт.` : ""
                  } Цены указаны в долларах, списание — в рублях по курсу ЦБ.`
                : " Оплата онлайн в рублях."
            }${
              countries.includes("KZ") || countries.includes("KG")
                ? " Для Казахстана и Кыргызстана понадобится ИИН (ПИН) получателя."
                : ""
            } Условия ввоза и возможные пошлины определяет страна получателя. Для других стран выберите «Другая страна» и оставьте заявку — менеджер свяжется с вами и рассчитает международную доставку.`
          : "Да. В форме заказа выберите страну доставки «Другая страна» и оставьте заявку — менеджер свяжется с вами и рассчитает международную доставку.",
      },
      {
        q: "Можно ли вернуть мел?",
        a: "Да, в течение 7 дней после получения. Порядок возврата описан на странице «Обмен и возврат».",
      },
    ],
  },
  footer: {
    tagline: "Limited Edition 0.98 β · 2000 экземпляров · Made in Japan",
    requisites: "Реквизиты продавца",
    seller: "Продавец",
    inn: "ИНН",
    ogrnip: "ОГРНИП",
    legalAddress: "Юридический адрес",
    actualAddress: "Фактический адрес",
    phone: "Телефон",
    email: "Email",
    docs: "Документы",
    links: [
      { href: "/delivery", label: "Доставка и оплата" },
      { href: "/returns", label: "Обмен и возврат" },
      { href: "/oferta", label: "Публичная оферта" },
      { href: "/privacy", label: "Политика конфиденциальности" },
      { href: "/consent", label: "Согласие на обработку данных" },
    ],
    order: "Оставить заявку",
  },
  signature: "Подпись Иосифа Абрамова",
};

export type Dict = typeof ru;

const en: Dict = {
  header: {
    skip: "Skip to content",
    home: "Kamui × Iosif Abramov — home",
    mainNav: "Main menu",
    mobileNav: "Mobile menu",
    nav: [
      { hash: "collection", label: "Collection" },
      { hash: "features", label: "Features" },
      { hash: "story", label: "Story" },
      { hash: "gallery", label: "Gallery" },
      { hash: "kit", label: "Gift set" },
    ],
    left: "Left",
    buy: "Buy",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    mobileStock: (left, total) => `Limited edition · ${n(left, "en")} of ${n(total, "en")} left`,
    switchLabel: "Русская версия",
    switchShort: "RU",
  },
  hero: {
    sliderAria: "Kamui × Iosif Abramov collection photos",
    eyebrow: "Limited edition",
    pieces: (total) => `${n(total, "en")} pieces`,
    cta: "Order now",
    price: "Price",
    trustAria: "Why buy here",
    trust: ["The champion’s choice", "100% quality guarantee", "Official distributor in the CIS"],
  },
  collection: {
    label: "Collection",
    title: (
      <>
        Not a consumable.
        <br />A <span className="red">collector’s</span> piece.
      </>
    ),
    lead1: (
      <>
        <strong>Kamui × Iosif Abramov</strong> is a limited-edition Kamui billiard chalk created together with Iosif
        Abramov for players who feel the difference between an ordinary shot and perfect control.
      </>
    ),
    lead2:
      "Every piece combines Kamui’s Japanese technology with the experience of Iosif Abramov, a multiple world champion in Russian billiards.",
    total: (total) => (
      <>
        Only <b>{n(total, "en")}</b> pieces have been made.
      </>
    ),
    editionTerm: "Edition",
    editionUnit: "pieces in the entire series",
    availableTerm: "Available now",
    availableUnit: (sold) => `left · ${n(sold, "en")} sold`,
    madeTerm: "Made in",
    madeUnit: "Kamui technology",
    modelTerm: "Model",
  },
  features: {
    label: "Features",
    title: (
      <>
        Precision <span className="red">in every detail</span>
      </>
    ),
    cards: [
      {
        title: "Control",
        body: <p>Reliable grip between cue tip and ball — consistent contact and confidence in every shot.</p>,
      },
      {
        title: "Clean play",
        body: (
          <>
            <p>We solved one of the main problems of ordinary chalk:</p>
            <ul>
              <li>fewer marks on the table;</li>
              <li>less residue on the cue;</li>
              <li>neater, more precise application.</li>
            </ul>
          </>
        ),
      },
      {
        title: "Collectible",
        body: <p>Every piece is part of the limited Kamui × Iosif Abramov release.</p>,
      },
    ],
    grip: {
      eyebrow: "Grip",
      title: (
        <>
          One of the best chalks <span className="red">for grip</span>
        </>
      ),
      text: "Kamui 0.98 β keeps the tip firmly on the ball: the contact stays the same shot after shot, and the cue doesn’t slip even with heavy spin. The chalk was created together with Iosif Abramov, a multiple world champion in Russian billiards.",
      topLines: ["Chosen", "by the", "champion"],
      topLabel: "The world champion’s choice",
      topCaption: "Made with a world champion",
      sealRing: "Quality guarantee · Original · Abramov Shop · ",
      sealCenter: "100%",
      sealSub: "guarantee",
      sealLabel: "100% quality guarantee",
      sealCaption: "100% quality guarantee",
    },
  },
  story: {
    label: "The story",
    title: (
      <>
        Why this chalk
        <br />
        was created
      </>
    ),
    problem: "Problem",
    problemText: "Players wanted more control, but ordinary chalk left too many marks.",
    solution: "Solution",
    solutionText: "A formula that combines grip, consistency and cleanliness.",
    formula: [
      { term: "Grip", note: "confident contact between tip and ball" },
      { term: "Consistency", note: "predictable shots, game after game" },
      { term: "Cleanliness", note: "fewer marks on cloth, hands and cue" },
    ],
  },
  official: {
    label: "Official store",
    title: (
      <>
        Official
        <br />
        <span className="gold">distributor</span>
      </>
    ),
    logo: "Abramov Shop",
    caption: "Abramov Shop · official distributor in the CIS",
    lead: (
      <>
        <strong>Abramov Shop</strong> is the official distributor of Kamui × Iosif Abramov 0.98 β chalk in the CIS. When
        you buy here, you get an original piece of the limited edition.
      </>
    ),
    accent: "An official purchase with a 100% quality guarantee.",
    points: [
      { title: "Official distributor in the CIS", text: "The chalk is supplied officially — no middlemen or resellers." },
      { title: "100% quality guarantee", text: "We stand behind every piece: an original from the Kamui × Iosif Abramov series." },
      { title: "Limited edition", text: "Only 2,000 pieces — buy the original from the official distributor." },
    ],
  },
  kit: {
    label: "Gift set",
    title: (
      <>
        Gift
        <br />
        <span className="gold">set</span>
      </>
    ),
    lead: "A ready-made gift for a billiards player: everything for the game and the collection in one box.",
    stageAria: "Animation: the cloth, the signed photo, the chalk and the JOS tip go into the box",
    photoAlt:
      "Kamui × Iosif Abramov gift set in an open box: Champion cloth, a photo signed by Iosif Abramov in an envelope, 0.98 β chalk and a JOS tip",
    itemsAria: "What is in the set",
    items: [
      { title: "“Champion” cloth", text: "Embroidered with the Champion billiard club logo — for your cue and balls." },
      { title: "Photo signed by Iosif Abramov", text: "A photo personally signed by the multiple world champion, in an envelope." },
      { title: "Kamui × Iosif Abramov 0.98 β chalk", text: "A piece of the limited edition in its branded pouch." },
      { title: "JOS tip of your choice", text: "Choose the hardness: M, H, H+, PM, PH or PRO. Packed in a zip bag." },
    ],
    priceLabel: "Set price",
    tipsLabel: "JOS tip",
    cta: (tip: string) => (tip ? `Order the set with a ${tip} tip` : "Order the set"),
    replay: "Replay animation",
  },
  gallery: {
    label: "Gallery",
    hint: "Tap a photo to view it full screen",
    open: (caption) => `Open photo: ${caption}`,
    dialog: "Photo viewer",
    lightbox: "Collection photos",
    close: "Close",
  },
  slider: {
    prev: "Previous photo",
    next: "Next photo",
    slide: (i, count, caption) => `${i} of ${count}: ${caption}`,
    dot: (i, caption) => `Photo ${i}: ${caption}`,
  },
  stock: {
    soldOut: "Sold out",
    left: "Left",
    ofTotal: (total) => `of ${n(total, "en")} pcs`,
    meter: "Pieces sold",
    meterText: (sold, total) => `${sold} of ${total} sold`,
    note: (sold, total) => `${n(sold, "en")} of ${n(total, "en")} pieces sold`,
  },
  qty: {
    less: "Decrease quantity",
    more: "Increase quantity",
    pcs: (q) => `${q} ${q === 1 ? "pc" : "pcs"}`,
  },
  purchase: {
    label: "Purchase",
    title: (
      <>
        Secure
        <br />
        <span className="red">your piece</span>
      </>
    ),
  },
  order: {
    formAria: "Order request",
    perPiece: "per piece",
    perKit: "per set",
    productAria: "What you are ordering",
    chalkOption: "Chalk",
    chalkOptionSub: "Limited Edition 0.98 β",
    wholesaleFrom: (min, price) => `${min}+ pcs — ${price}`,
    wholesaleHint: (min, price) => `Order ${min}+ pcs for the bulk price of ${price} per chalk`,
    wholesaleTake: (min) => `Take ${min} pcs`,
    wholesaleOn: (min, saving) => `Bulk price for ${min}+ pcs — you save ${saving}`,
    wholesaleBadge: "bulk",
    kitOption: "Gift set",
    kitOptionSub: "chalk, signed photo, cloth, JOS tip",
    kitName: "Gift set",
    kitSub: "Kamui × Iosif Abramov",
    tipLabel: "JOS tip",
    tipHint: "Choose the hardness — we will put it in the set",
    goodsKit: "Gift set",
    quantity: "Quantity",
    goods: "Items",
    total: "Total",
    soldOut: "Sold out",
    placeOrder: "Place an order",
    request: "Place an order",
    notePay: () => "",
    noteRequest:
      "No prepayment: after you place an order, we will contact you to arrange international shipping and payment.",
    destination: "Delivery country",
    otherCountry: "Other country",
    destinationHintRu: "",
    destinationHintCdek: "",
    destinationHintRobokassa: "",
    destinationHintOther: "",
    abroadPay: "",
    abroadPayRobokassa: "",
    payInRub: (rub: string, rate: string) => `Charged ${rub} at ${rate} per $1`,
    taxIdKz: "Recipient's IIN",
    taxIdKzHint: "",
    taxIdKg: "Recipient's PIN",
    taxIdKgHint: "",
    noteRobokassa: "",
    name: "Full name",
    nameLatin: "Full name (Latin letters)",
    namePlaceholder: "John Smith",
    nameLatinPlaceholder: "John Smith",
    nameHint: "As in your passport",
    nameLatinHint: "As in your passport. Cyrillic is converted to Latin automatically",
    phone: "Phone",
    email: "Email",
    country: "Country",
    countryPlaceholder: "e.g. Germany",
    city: "City",
    cityPlaceholderRu: "City",
    cityPlaceholderIntl: "City",
    postalCode: "Postal code",
    postalPlaceholder: "ZIP / postal code",
    address: "Address",
    addressPlaceholder: "Street, building, apartment",
    comment: "Comment",
    commentPlaceholderRu: "Anything we should know",
    commentPlaceholderIntl: "Preferred carrier, messenger for contact",
    consentBefore: "I agree to the",
    consentLink: "processing of my personal data",
    privacyLink: "Privacy policy (in Russian)",
    newsletter: "I agree to receive emails about my order: payment confirmation and the tracking number. No advertising.",
    sending: "Sending…",
    toPayment: "Redirecting to payment…",
    pay: (sum) => `Proceed to payment · ${sum}`,
    send: (q) => `Send order request · ${q} ${q === 1 ? "pc" : "pcs"}`,
    noteIntl:
      "International shipping cost and method are calculated individually — we will send you a quote after you place the order.",
    successTitle: "Request sent",
    successText: "Thank you! Your order request has been received. We will contact you to arrange shipping and payment.",
    noPaymentText: "Thank you! Your order request has been received. We will contact you to arrange shipping and payment.",
    orderNumber: "Order number",
    checkMail: "Please check your email — and your spam folder: we will send you messages about your order.",
    again: "Place another order",
    failed: "Could not send the request. Please try again.",
    offline: "No connection. Check your internet and try again.",
    otherVersion: { text: "Ordering within Russia?", link: "Switch to the Russian version", href: "/#buy" },
    progress: {
      payTitle: "Preparing payment",
      requestTitle: "Sending your request",
      paySteps: ["Checking availability and delivery", "Creating your order", "Preparing secure payment", "Opening the payment page"],
      requestSteps: ["Checking availability", "Saving your request"],
      usually: "This usually takes a few seconds",
      slow: "Taking a little longer than usual — please don't close or refresh the page",
      created: (id: string) => `Order ${id} created`,
      secure: "Secure payment · YooKassa",
      notOpened: "Payment page didn't open?",
      openPay: "Open payment",
      timeout: "The server is taking too long to respond. Check your connection and press the button again.",
    },
  },
  faq: {
    label: "FAQ",
    title: (
      <>
        Kamui ×
        <br />
        <span className="red">Iosif Abramov</span> chalk
      </>
    ),
    items: (
      price: string,
      _countries?: readonly string[],
      _robokassa?: boolean,
      _abroadPrice?: string,
      kitPrice = `$${KIT.priceUsd}`,
      wholesale = `$${WHOLESALE.priceUsd}`,
    ) => [
      {
        q: "What is the Kamui × Iosif Abramov 0.98 β chalk?",
        a: "A limited-edition Kamui billiard chalk created together with Iosif Abramov, a multiple world champion in Russian billiards. It is made with Kamui’s Japanese 0.98 β technology in the Pyramid line. Only 2,000 pieces exist.",
      },
      {
        q: "Who is Iosif Abramov?",
        a: "Iosif Abramov is a Russian billiards player and a multiple world champion in Russian billiards. In 2026 he won the World Championship in Dynamic Pyramid in Samarkand. His experience shaped this Kamui chalk series.",
      },
      {
        q: "Is it suitable for Russian billiards (pyramid)?",
        a: "Yes. The chalk belongs to the Kamui Pyramid line, designed for Russian billiards.",
      },
      {
        q: "How is it different from ordinary chalk?",
        a: "It keeps the tip firmly on the ball and gives a predictable shot game after game, while leaving fewer marks on the cloth, hands and cue.",
      },
      {
        q: "How much does it cost and how do I order from abroad?",
        a: `The price is ${price} per piece, or ${wholesale} per piece when you order ${WHOLESALE.minQty} or more. Send an order request on this page — our manager will contact you to confirm international shipping and payment.`,
      },
      {
        q: "Is there a bulk price?",
        a: `Yes. When one order has ${WHOLESALE.minQty} or more pieces of chalk, each costs ${wholesale} instead of ${price}. Up to ${PRODUCT.maxPerOrder} pieces per order. The bulk price does not apply to gift sets.`,
      },
      {
        q: "Is it original? Where can I buy it officially?",
        a: "Yes. Abramov Shop is the official distributor of Kamui × Iosif Abramov 0.98 β chalk in the CIS. Buying on this site is an official purchase with a 100% quality guarantee.",
      },
      {
        q: "What is in the gift set?",
        a: `Kamui × Iosif Abramov 0.98 β chalk, a photo signed by Iosif Abramov in an envelope, a “Champion” billiard club cloth and a JOS cue tip — you choose the hardness when ordering: M, H, H+, PM, PH or PRO. Everything comes in a branded box. The set costs ${kitPrice}.`,
      },
    ],
  },
  footer: {
    tagline: "Limited Edition 0.98 β · 2000 pieces · Made in Japan",
    requisites: "Seller details",
    seller: "Seller",
    inn: "Taxpayer ID (INN)",
    ogrnip: "Registration No. (OGRNIP)",
    legalAddress: "Registered address",
    actualAddress: "Business address",
    phone: "Phone",
    email: "Email",
    docs: "Documents",
    links: [
      { href: "/delivery", label: "Delivery & payment (RU)" },
      { href: "/returns", label: "Returns (RU)" },
      { href: "/oferta", label: "Public offer (RU)" },
      { href: "/privacy", label: "Privacy policy (RU)" },
      { href: "/consent", label: "Data processing consent (RU)" },
    ],
    order: "Place an order",
  },
  signature: "Signature of Iosif Abramov",
};

export const DICT: Record<Lang, Dict> = { ru, en };

export const t = (lang: Lang = "ru"): Dict => DICT[lang];
