/**
 * ─────────────────────────────────────────────
 * 1. СЛОВАРИК ЦЕН (парсится из JSON при загрузке)
 * ─────────────────────────────────────────────
 *
 * Структура JSON (iКЭДО):
 *   Секция 1 (Column1 = 1)  — тарифы НЕ Москва и МО
 *   Секция 2 (Column1 = 2)  — тарифы Москва и МО
 *   Секция 3 (Column1 = 3)  — помесячный доп. объём
 *   Секция 4 (Column1 = 4)  — промо-тариф
 *   Услуги   (Column9/10)   — сервисные услуги
 *
 * После парсинга PRICES выглядит так:
 * {
 *   ikedo: {
 *     other: {                        // НЕ Москва и МО
 *       minimal_12:    1000,
 *       minimal_24:    1700,
 *       standard_12:   900,
 *       standard_24:   1550,
 *       corporate_12:  800,
 *       corporate_24:  1400,
 *     },
 *     moscow: {                       // Москва и МО
 *       minimal_12:    1200,
 *       minimal_24:    1900,
 *       standard_12:   1100,
 *       standard_24:   1750,
 *       corporate_12:  1000,
 *       corporate_24:  1600,
 *     },
 *     extra_monthly:   90,            // Доп. лицензия (помесячно)
 *     promo:           0,             // Промо (1 мес.)
 *   },
 *   services: {
 *     install_1c:      4000,   // Установка и настройка расширения iКЭДО в 1С
 *     start_work:      20000,  // Старт работы в ПП Астрал iКЭДО
 *     roadmap:         4000,   // Внедрение по дорожной карте (за час)
 *     onpremise:       450000, // Развертывание on-premise
 *     onpremise_upd:   90000,  // Передача файлов-обновлений on-premise
 *   }
 * }
 */

const PRICES = {
    ikedo: {
        other:  {},
        moscow: {},
        extra_monthly: 0,
        promo:         0,
    },
    services: {}
};

/**
 * Функция парсинга JSON → заполняет PRICES
 * Вызывается один раз при загрузке файла тарифов.
 */
function parsePricesFromJSON(json) {
    const rows = json['iКЭДО'];
    if (!rows) return;

    // Определяем текущую секцию по маркерным строкам Column1
    let section = null; // 1=other, 2=moscow, 3=extra, 4=promo

    // Счётчики строк внутри каждой секции лицензий
    // (используем для позиционного разбора: минимальный/стандартный/корпоративный × 12/24 мес.)
    const otherRows  = [];  // строки секции 1
    const moscowRows = [];  // строки секции 2

    rows.forEach(row => {
        if (!row) return;

        // Маркеры начала секций
        if (row['Column1'] === 1) { section = 1; return; }
        if (row['Column1'] === 2) { section = 2; return; }
        if (row['Column1'] === 3) { section = 3; return; }
        if (row['Column1'] === 4) { section = 4; return; }

        const price = row['Column4'];
        const term  = row['Column5'];

        // ── Секция 1: НЕ Москва и МО ──
        if (section === 1 && typeof price === 'number') {
            otherRows.push({ price, term });
        }

        // ── Секция 2: Москва и МО ──
        if (section === 2 && typeof price === 'number') {
            moscowRows.push({ price, term });
        }

        // ── Секция 3: Доп. помесячный ──
        if (section === 3 && typeof price === 'number') {
            PRICES.ikedo.extra_monthly = price;
        }

        // ── Секция 4: Промо ──
        if (section === 4 && typeof price === 'number') {
            PRICES.ikedo.promo = price;
        }

        // ── Услуги (Column9 + Column10) — встречаются в любой секции ──
        const svcName  = row['Column9'];
        const svcPrice = row['Column10'];
        if (svcName && typeof svcPrice === 'number') {
            mapServicePrice(svcName, svcPrice);
        }
    });

    // Позиционный маппинг строк лицензий
    // Порядок в JSON: minimal×12, minimal×24, standard×12, standard×24, corporate×12, corporate×24
    const keyMap = [
        'minimal_12', 'minimal_24',
        'standard_12', 'standard_24',
        'corporate_12', 'corporate_24',
    ];

    otherRows.forEach((r, i)  => { if (keyMap[i]) PRICES.ikedo.other[keyMap[i]]  = r.price; });
    moscowRows.forEach((r, i) => { if (keyMap[i]) PRICES.ikedo.moscow[keyMap[i]] = r.price; });
}

/** Маппинг названий услуг из JSON → ключи PRICES.services */
function mapServicePrice(name, price) {
    const n = name.trim();
    if (n.includes('Установка и настройка расширения'))      PRICES.services.install_1c    = price;
    else if (n.includes('Старт работы'))                     PRICES.services.start_work    = price;
    else if (n.includes('дорожной карте'))                   PRICES.services.roadmap       = price;
    else if (n.includes('развертыванию') || n.includes('on-premise') && !n.includes('обновлений')) {
        PRICES.services.onpremise = price;
    }
    else if (n.includes('обновлений'))                       PRICES.services.onpremise_upd = price;
}

/** Удобный геттер: PRICES.get('ikedo', 'moscow', 'standard_12') */
PRICES.get = function(product, region, key) {
    return this[product]?.[region]?.[key] ?? 0;
};

// ─────────────────────────────────────────────


/**
 * 2. КОНФИГУРАЦИЯ ТАРИФОВ
 * (диапазоны и названия — без цен, цены теперь в PRICES)
 */
const TARIFFS = [
    {
        id:        'minimal',
        name:      'Минимальный',
        minEmp:    1,
        maxEmp:    299,
        rangeLabel:'от 1 до 299 сотрудников',
    },
    {
        id:        'standard',
        name:      'Стандартный',
        minEmp:    300,
        maxEmp:    2999,
        rangeLabel:'от 300 до 2 999 сотрудников',
    },
    {
        id:        'corporate',
        name:      'Корпоративный',
        minEmp:    3000,
        maxEmp:    Infinity,
        rangeLabel:'от 3 000 сотрудников',
    },
];


/**
 * 3. СОСТОЯНИЕ
 */
const State = {
    data: {
        region:    'moscow',   // 'moscow' | 'other'
        employees: 0,
        term:      12,         // 12 | 24 (месяцев) — пригодится позже
    }
};


/**
 * 4. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
 */
const Helpers = {
    fmt: (num) => Math.round(num).toLocaleString('ru-RU'),

    getTariff(employees) {
        if (!employees || employees <= 0) return null;
        return TARIFFS.find(t => employees >= t.minEmp && employees <= t.maxEmp) || null;
    },

    /** Возвращает цену за 1 сотрудника из PRICES по текущему состоянию */
    getPerEmpPrice(tariffId, region, term) {
        const key = `${tariffId}_${term}`;
        return PRICES.get('ikedo', region, key);
    }
};


/**
 * 5. ЛОГИКА РАСЧЁТА
 */
const Calculator = {
    calculateAll() {
        const { employees, region, term } = State.data;
        const tariff = Helpers.getTariff(employees);
        if (!tariff) return { total: 0, lines: [], meta: null };

        const perEmp    = Helpers.getPerEmpPrice(tariff.id, region, term);
        const totalYear = employees * perEmp;
        const totalMonth = Math.round(totalYear / 12);

        const regionLabel = region === 'moscow'
            ? 'Москва и Московская область'
            : 'Другие регионы';

        const lines = [
            `Тариф: ${tariff.name} | ${tariff.rangeLabel}`,
            `Регион: ${regionLabel}`,
            `Срок: ${term} месяцев`,
            `Сотрудников: ${Helpers.fmt(employees)} чел.`,
            `Цена за 1 сотрудника: ${Helpers.fmt(perEmp)} ₽`,
            `Итого: ${Helpers.fmt(totalYear)} ₽`,
        ];

        return {
            total: totalYear,
            lines,
            meta: { tariff, perEmp, totalYear, totalMonth, employees, region, term }
        };
    }
};


/**
 * 6. ОТРИСОВКА (UI)
 */
const UI = {
    els: {},

    init() {
        this.cacheElements();
        this.bindEvents();
    },

    cacheElements() {
        const ids = ['dynamic-content', 'total-price', 'details-content', 'employees-count'];
        ids.forEach(id => this.els[id] = document.getElementById(id));
    },

    bindEvents() {
        document.body.addEventListener('click', e => this.handleClick(e));
        document.body.addEventListener('input', e => this.handleInput(e));
    },

    handleClick(e) {
        const btn = e.target.closest('[data-click]');
        if (!btn) return;

        if (btn.dataset.click === 'set-region') {
            btn.closest('.toggle-group')
               .querySelectorAll('.toggle-btn')
               .forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            State.data.region = btn.dataset.val;
            this.update();
        }
    },

    handleInput(e) {
        const t = e.target;
        if (t.dataset.action === 'employees') {
            State.data.employees = parseInt(t.value) || 0;
            this.update();
        }
    },

    update() {
        const result = Calculator.calculateAll();

        this.els['total-price'].textContent = Helpers.fmt(result.total) + ' ₽';

        this.els['details-content'].innerHTML = result.lines.length
            ? result.lines.join('<br>')
            : 'Введите данные для расчета...';

        this.renderTariffCard(result.meta);
    },

    renderTariffCard(meta) {
        const container = this.els['dynamic-content'];

        if (!meta) {
            container.innerHTML = `
                <div class="placeholder-text">
                    Здесь будут параметры тарифа... <br>
                    <strong>Введите количество сотрудников</strong>
                </div>`;
            return;
        }

        const t           = meta.tariff;
        const regionLabel = meta.region === 'moscow' ? 'Москва и МО' : 'Другие регионы';

        container.innerHTML = `
            <div class="tariff-card animated-fade">
                <div class="tariff-header">
                    <span class="tariff-label">${t.name}</span>
                    <h3 class="tariff-title">${t.rangeLabel}</h3>
                </div>
                <div class="detailing-section">
                    <div class="detail-row">
                        <span>Регион</span>
                        <strong>${regionLabel}</strong>
                    </div>
                    <div class="detail-row">
                        <span>Количество сотрудников</span>
                        <strong>${Helpers.fmt(meta.employees)} чел.</strong>
                    </div>
                    <div class="detail-row">
                        <span>Цена за 1 сотрудника</span>
                        <strong>${Helpers.fmt(meta.perEmp)} ₽</strong>
                    </div>
                    <div class="detail-row highlight">
                        <span>Итого в месяц</span>
                        <strong>${Helpers.fmt(meta.totalMonth)} ₽</strong>
                    </div>
                    <div class="detail-row highlight">
                        <span>Итого в год</span>
                        <strong>${Helpers.fmt(meta.totalYear)} ₽</strong>
                    </div>
                </div>
            </div>`;
    }
};


/**
 * 7. ИНИЦИАЛИЗАЦИЯ
 */
document.addEventListener('DOMContentLoaded', async () => {
    UI.init();

    try {
        const res  = await fetch('tariffs.json');
        const json = await res.json();
        parsePricesFromJSON(json);
        console.log('✅ Цены загружены:', PRICES);
        UI.update();
    } catch (e) {
        console.warn('⚠️ Файл тарифов не найден, используются нули:', e.message);
    }
});