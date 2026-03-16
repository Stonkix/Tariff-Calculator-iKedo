/**
 * 1. КОНФИГУРАЦИЯ И КОНСТАНТЫ
 */
const CONSTANTS = {
    TARIFFS: [
        { id: 'minimal',   name: 'Минимальный',   minEmp: 1,    maxEmp: 299,      rangeLabel: 'от 1 до 299 сотрудников' },
        { id: 'standard',  name: 'Стандартный',   minEmp: 300,  maxEmp: 2999,     rangeLabel: 'от 300 до 2 999 сотрудников' },
        { id: 'corporate', name: 'Корпоративный', minEmp: 3000, maxEmp: Infinity, rangeLabel: 'от 3 000 сотрудников' },
    ],
    SERVICES: [
        {
            id: 'install_1c',
            label: 'Установка и настройка расширения ПП Астрал iКЭДО в 1С',
            priceKey: 'install_1c',
            unit: 'шт.',
        },
        {
            id: 'start_work',
            label: 'Старт работы в ПП Астрал iКЭДО',
            priceKey: 'start_work',
            unit: 'шт.',
        },
        {
            id: 'roadmap',
            label: 'Внедрение сервиса iКЭДО по дорожной карте клиента (1 час)',
            priceKey: 'roadmap',
            unit: 'ч.',
        },
        {
            id: 'onpremise',
            label: 'Услуги по развертыванию ПП iКЭДО (on-premise)',
            priceKey: 'onpremise',
            unit: 'шт.',
        },
        {
            id: 'onpremise_upd',
            label: 'Передача файлов-обновлений ПП iКЭДО (on-premise, только для продления)',
            priceKey: 'onpremise_upd',
            unit: 'шт.',
        },
    ]
};

/**
 * 2. СЛОВАРЬ ЦЕН
 */
const PRICES = {
    ikedo: {
        other:  {},
        moscow: {},
        extra_monthly: 0,
        promo: 0,
    },
    services: {}
};

function parsePricesFromJSON(json) {
    const rows = json['iКЭДО'];
    if (!rows) return;

    let section = null;
    const otherRows  = [];
    const moscowRows = [];

    rows.forEach(row => {
        if (!row) return;
        if (row['Column1'] === 1) { section = 1; return; }
        if (row['Column1'] === 2) { section = 2; return; }
        if (row['Column1'] === 3) { section = 3; return; }
        if (row['Column1'] === 4) { section = 4; return; }

        const price = row['Column4'];

        if (section === 1 && typeof price === 'number') otherRows.push(price);
        if (section === 2 && typeof price === 'number') moscowRows.push(price);
        if (section === 3 && typeof price === 'number') PRICES.ikedo.extra_monthly = price;
        if (section === 4 && typeof price === 'number') PRICES.ikedo.promo = price;

        const svcName  = row['Column9'];
        const svcPrice = row['Column10'];
        if (svcName && typeof svcPrice === 'number') mapServicePrice(svcName, svcPrice);
    });

    const keyMap = ['minimal_12','minimal_24','standard_12','standard_24','corporate_12','corporate_24'];
    otherRows.forEach((p, i)  => { if (keyMap[i]) PRICES.ikedo.other[keyMap[i]]  = p; });
    moscowRows.forEach((p, i) => { if (keyMap[i]) PRICES.ikedo.moscow[keyMap[i]] = p; });
}

function mapServicePrice(name, price) {
    const n = name.trim();
    if      (n.includes('Установка и настройка расширения'))  PRICES.services.install_1c    = price;
    else if (n.includes('Старт работы'))                      PRICES.services.start_work    = price;
    else if (n.includes('дорожной карте'))                    PRICES.services.roadmap       = price;
    else if (n.includes('развертыванию') || (n.includes('on-premise') && !n.includes('обновлений')))
                                                              PRICES.services.onpremise     = price;
    else if (n.includes('обновлений'))                        PRICES.services.onpremise_upd = price;
}

PRICES.get = function(region, tariffId, term) {
    return this.ikedo[region]?.[`${tariffId}_${term}`] ?? 0;
};

/**
 * 3. СОСТОЯНИЕ
 */
const State = {
    data: {
        region:        'moscow',
        employees:     0,
        term:          12,
        altTariff:     null,   // null | 'monthly' | 'promo'
        monthlyMonths: 1,      // 1–11
        services:      {},
    },

    initServices() {
        CONSTANTS.SERVICES.forEach(s => { this.data.services[s.id] = 0; });
    },

    getTariff(employees) {
        if (!employees || employees <= 0) return null;
        return CONSTANTS.TARIFFS.find(t => employees >= t.minEmp && employees <= t.maxEmp) || null;
    },
};

/**
 * 4. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
 */
const Helpers = {
    fmt: (num) => Math.round(num).toLocaleString('ru-RU'),
    regionLabel: (region) => region === 'moscow' ? 'Москва и Московская область' : 'Другие регионы',
};

/**
 * 5. ЛОГИКА РАСЧЁТА
 */
const Calculator = {
    calculateAll() {
        const { employees, region, term, altTariff, monthlyMonths, services } = State.data;
        const tariff = State.getTariff(employees);
        let lines = [], total = 0, meta = null;

        // ── Тариф ──
        if (employees > 0) {
            if (altTariff === 'promo') {
                total += 0;
                lines.push(`Промо-тариф (1 месяц): 0 ₽`);
                meta = { type: 'promo', employees, regionLabel: Helpers.regionLabel(region) };

            } else if (altTariff === 'monthly') {
                const months        = Math.min(Math.max(monthlyMonths, 1), 11);
                const perEmp        = PRICES.ikedo.extra_monthly;
                const costPerMonth  = employees * perEmp;
                const costTotal     = costPerMonth * months;
                total += costTotal;
                lines.push(`Помесячный тариф: ${employees} сотр. × ${Helpers.fmt(perEmp)} ₽ × ${months} мес. = ${Helpers.fmt(costTotal)} ₽`);
                meta = { type: 'monthly', employees, perEmp, costPerMonth, costTotal, months, regionLabel: Helpers.regionLabel(region) };

            } else if (tariff) {
                const perEmp    = PRICES.get(region, tariff.id, term);
                const totalYear = employees * perEmp;
                total += totalYear;
                lines.push(`Тариф: ${tariff.name} | ${tariff.rangeLabel}: ${Helpers.fmt(totalYear)} ₽`);
                meta = { type: 'main', tariff, perEmp, totalYear, totalMonth: Math.round(totalYear / 12), employees, region, term, regionLabel: Helpers.regionLabel(region) };
            }
        }

        // ── Услуги ──
        CONSTANTS.SERVICES.forEach(svc => {
            const qty = services[svc.id] || 0;
            if (qty > 0) {
                const price = PRICES.services[svc.priceKey] || 0;
                const sum   = price * qty;
                total += sum;
                lines.push(`${svc.label} × ${qty}: ${Helpers.fmt(sum)} ₽`);
            }
        });

        return { total, lines, meta };
    }
};

/**
 * 6. ОТРИСОВКА (UI)
 */
const UI = {
    els: {},

    init() {
        this.renderServicesHTML();
        this.cacheElements();
        this.bindEvents();
    },

    cacheElements() {
        ['dynamic-content','total-price','details-content','employees-count']
            .forEach(id => this.els[id] = document.getElementById(id));
    },

    renderServicesHTML() {
        const container = document.getElementById('services-container');
        if (!container) return;
        container.innerHTML = CONSTANTS.SERVICES.map(svc => `
            <div class="addon-card" id="svc-card-${svc.id}">
                <div class="addon-header">
                    <span class="addon-title">${svc.label}</span>
                    <label class="custom-switch">
                        <input type="checkbox" data-action="toggle-svc" data-id="${svc.id}">
                        <span class="slider"></span>
                    </label>
                </div>
                <div id="svc-body-${svc.id}" style="display:none; margin-top:10px;">
                    <div class="variant-row">
                        <span class="v-label">Количество (${svc.unit})</span>
                        <div class="v-controls">
                            <input type="number" class="qty-input" min="1" value="1"
                                data-action="svc-qty" data-id="${svc.id}">
                        </div>
                    </div>
                    <div id="svc-hint-${svc.id}" style="font-size:12px; color:#888; margin-top:6px; text-align:right;"></div>
                </div>
            </div>`).join('');
    },

    update() {
        const result = Calculator.calculateAll();
        this.els['total-price'].textContent = Helpers.fmt(result.total) + ' ₽';
        this.els['details-content'].innerHTML = result.lines.length
            ? result.lines.join('<br>')
            : 'Введите данные для расчета...';
        this.renderTariffCard(result.meta);
        this.updateServiceHints();
    },

    updateServiceHints() {
        CONSTANTS.SERVICES.forEach(svc => {
            const hint = document.getElementById(`svc-hint-${svc.id}`);
            if (!hint) return;
            const price = PRICES.services[svc.priceKey] || 0;
            const qty   = State.data.services[svc.id] || 0;
            hint.textContent = (price > 0 && qty > 0)
                ? `${Helpers.fmt(price)} ₽ × ${qty} = ${Helpers.fmt(price * qty)} ₽`
                : '';
        });
    },

    renderTariffCard(meta) {
        const container = this.els['dynamic-content'];
        if (!meta) {
            container.innerHTML = `<div class="placeholder-text">Здесь будут параметры тарифа...<br><strong>Введите количество сотрудников</strong></div>`;
            return;
        }

        let bodyHTML = '';

        if (meta.type === 'promo') {
            bodyHTML = `
                <div class="detail-row"><span>Регион</span><strong>${meta.regionLabel}</strong></div>
                <div class="detail-row"><span>Количество сотрудников</span><strong>${Helpers.fmt(meta.employees)} чел.</strong></div>
                <div class="detail-row highlight"><span>Срок</span><strong>1 месяц</strong></div>
                <div class="detail-row highlight"><span>Стоимость</span><strong>0 ₽</strong></div>`;

        } else if (meta.type === 'monthly') {
            bodyHTML = `
                <div class="detail-row"><span>Регион</span><strong>${meta.regionLabel}</strong></div>
                <div class="detail-row"><span>Количество сотрудников</span><strong>${Helpers.fmt(meta.employees)} чел.</strong></div>
                <div class="detail-row"><span>Цена за 1 сотрудника/мес.</span><strong>${Helpers.fmt(meta.perEmp)} ₽</strong></div>
                <div class="detail-row"><span>Стоимость в месяц</span><strong>${Helpers.fmt(meta.costPerMonth)} ₽</strong></div>
                <div class="detail-row highlight"><span>Срок</span><strong>${meta.months} мес.</strong></div>
                <div class="detail-row highlight"><span>Итого</span><strong>${Helpers.fmt(meta.costTotal)} ₽</strong></div>`;

        } else {
            const t = meta.tariff;
            bodyHTML = `
                <div class="detail-row"><span>Регион</span><strong>${meta.regionLabel}</strong></div>
                <div class="detail-row"><span>Количество сотрудников</span><strong>${Helpers.fmt(meta.employees)} чел.</strong></div>
                <div class="detail-row"><span>Срок</span><strong>${meta.term} месяцев</strong></div>
                <div class="detail-row"><span>Цена за 1 сотрудника</span><strong>${Helpers.fmt(meta.perEmp)} ₽</strong></div>
                <div class="detail-row highlight"><span>Итого в месяц</span><strong>${Helpers.fmt(meta.totalMonth)} ₽</strong></div>
                <div class="detail-row highlight"><span>Итого за период</span><strong>${Helpers.fmt(meta.totalYear)} ₽</strong></div>`;
        }

        const labelText = meta.type === 'promo'   ? 'Промо'
                        : meta.type === 'monthly' ? 'Помесячный'
                        : meta.tariff.name;
        const titleText = meta.type === 'promo'   ? '0 ₽ — первый месяц'
                        : meta.type === 'monthly' ? 'до 11 месяцев'
                        : meta.tariff.rangeLabel;

        container.innerHTML = `
            <div class="tariff-card animated-fade">
                <div class="tariff-header">
                    <span class="tariff-label">${labelText}</span>
                    <h3 class="tariff-title">${titleText}</h3>
                </div>
                <div class="detailing-section">${bodyHTML}</div>
            </div>`;
    },

    bindEvents() {
        document.body.addEventListener('click',  e => this.handleClick(e));
        document.body.addEventListener('input',  e => this.handleInput(e));
        document.body.addEventListener('change', e => this.handleChange(e));
    },

    handleClick(e) {
        const btn = e.target.closest('[data-click]');
        if (!btn) return;
        const act = btn.dataset.click;

        if (act === 'set-region') {
            btn.closest('.toggle-group').querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            State.data.region = btn.dataset.val;
            this.update();
        }
        else if (act === 'set-term') {
            btn.closest('.toggle-group').querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            State.data.term = parseInt(btn.dataset.val);
            this.update();
        }
        else if (act === 'set-alt-tariff') {
            const val   = btn.dataset.val;
            const group = btn.closest('.toggle-group');

            if (State.data.altTariff === val) {
                // повторный клик — сброс
                State.data.altTariff = null;
                group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('selected'));
            } else {
                group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                State.data.altTariff = val;
            }

            const monthsRow = document.getElementById('monthly-months-row');
            if (monthsRow) {
                monthsRow.style.display = (State.data.altTariff === 'monthly') ? 'flex' : 'none';
            }
            this.update();
        }
    },

    handleInput(e) {
        const t = e.target, act = t.dataset.action, val = t.value;
        if (act === 'employees') {
            State.data.employees = parseInt(val) || 0;
            this.update();
        }
        else if (act === 'monthly-months') {
            State.data.monthlyMonths = Math.min(Math.max(parseInt(val) || 1, 1), 11);
            this.update();
        }
        else if (act === 'svc-qty') {
            State.data.services[t.dataset.id] = Math.max(1, parseInt(val) || 1);
            this.update();
        }
    },

    handleChange(e) {
        const t = e.target, act = t.dataset.action;
        if (act === 'toggle-svc') {
            const id      = t.dataset.id;
            const checked = t.checked;
            document.getElementById(`svc-body-${id}`).style.display = checked ? 'block' : 'none';
            document.getElementById(`svc-card-${id}`).classList.toggle('active', checked);
            State.data.services[id] = checked ? (State.data.services[id] || 1) : 0;
            this.update();
        }
    }
};

/**
 * 7. ИНИЦИАЛИЗАЦИЯ
 */
document.addEventListener('DOMContentLoaded', async () => {
    State.initServices();
    UI.init();

    try {
        const res  = await fetch('tariffs.json');
        const json = await res.json();
        parsePricesFromJSON(json);
        console.log('✅ Цены загружены:', PRICES);
    } catch (e) {
        console.warn('⚠️ Файл тарифов не найден, используются нули:', e.message);
    }

    UI.update();
});