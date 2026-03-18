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
        subMode:       'standard',   // 'standard' | 'individual'
        region:        'moscow',
        employees:     0,
        tariffType:    'main',       // 'main' | 'monthly' | 'promo'
        term:          12,
        monthlyMonths: 1,            // 1–11
        services:      {},
        customPrices:  {},           // индивидуальные цены: { key: number }
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
    parseNum: (val) => {
        if (val === undefined || val === null) return 0;
        return parseFloat(val.toString().replace(',', '.')) || 0;
    },
};

/**
 * 5. ЛОГИКА РАСЧЁТА
 */
const Calculator = {
    // Получить цену за 1 сотрудника с учётом кастомной
    getPerEmpPrice(tariffId, region, term) {
        const baseKey = `${tariffId}_${region}_${term}`;
        const custom  = State.data.customPrices[baseKey];
        if (State.data.subMode === 'individual' && custom !== undefined) return custom;
        return PRICES.get(region, tariffId, term);
    },

    getMonthlyPrice() {
        const custom = State.data.customPrices['extra_monthly'];
        if (State.data.subMode === 'individual' && custom !== undefined) return custom;
        return PRICES.ikedo.extra_monthly;
    },

    getServicePrice(priceKey) {
        const custom = State.data.customPrices[`svc_${priceKey}`];
        if (State.data.subMode === 'individual' && custom !== undefined) return custom;
        return PRICES.services[priceKey] || 0;
    },

    calculateAll() {
        const { employees, region, term, tariffType, monthlyMonths, services } = State.data;
        const tariff = State.getTariff(employees);
        let lines = [], total = 0, meta = null;

        // ── Тариф ──
        if (employees > 0) {
            if (tariffType === 'promo') {
                total += 0;
                lines.push(`Промо-тариф (1 месяц): 0 ₽`);
                meta = { type: 'promo', employees, regionLabel: Helpers.regionLabel(region) };

            } else if (tariffType === 'monthly') {
                const months       = Math.min(Math.max(monthlyMonths, 1), 11);
                const perEmp       = this.getMonthlyPrice();
                const costPerMonth = employees * perEmp;
                const costTotal    = costPerMonth * months;
                total += costTotal;
                lines.push(`Помесячный тариф: ${employees} сотр. × ${Helpers.fmt(perEmp)} ₽ × ${months} мес. = ${Helpers.fmt(costTotal)} ₽`);
                meta = { type: 'monthly', employees, perEmp, costPerMonth, costTotal, months, regionLabel: Helpers.regionLabel(region) };

            } else if (tariff) {
                const perEmp    = this.getPerEmpPrice(tariff.id, region, term);
                const totalYear = employees * perEmp;
                total += totalYear;
                const termLabel = term === 24 ? 'на 2 года' : 'на 1 год';
                lines.push(`Тариф: ${tariff.name} | на ${Helpers.fmt(employees)} сотрудников (${termLabel}): ${Helpers.fmt(totalYear)} ₽`);
                meta = { type: 'main', tariff, perEmp, totalYear, totalMonth: Math.round(totalYear / 12), employees, region, term, regionLabel: Helpers.regionLabel(region) };
            }
        }

        // ── Услуги ──
        CONSTANTS.SERVICES.forEach(svc => {
            const qty = services[svc.id] || 0;
            if (qty > 0) {
                const price = this.getServicePrice(svc.priceKey);
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

    // ── Рендер карточек сервисных услуг ──
    renderServicesHTML() {
        const container = document.getElementById('services-container');
        if (!container) return;
        const isInd = State.data.subMode === 'individual';

        container.innerHTML = CONSTANTS.SERVICES.map(svc => {
            const isActive = State.data.services[svc.id] > 0;
            const qty = State.data.services[svc.id] || 1;

            const customPriceBlock = isInd ? `
                <details class="card-price-details" style="margin-top: 12px; border-top: 1px solid #eee; padding-top: 10px;">
                    <summary class="custom-price-summary">Изменить стоимость</summary>
                    <div class="custom-price-content">
                        <div class="custom-price-row">
                            <span>Цена за единицу</span>
                            <input type="number" min="0"
                                value="${State.data.customPrices[`svc_${svc.priceKey}`] ?? ''}"
                                placeholder="${PRICES.services[svc.priceKey] || 0}"
                                class="custom-price-input"
                                onkeydown="if(['-','e','E',',','.'].includes(event.key)) event.preventDefault();"
                                oninput="window.updateSvcCustomPrice('${svc.priceKey}', this.value)">
                        </div>
                    </div>
                </details>` : '';

            return `
            <div class="addon-card ${isActive ? 'active' : ''}" id="svc-card-${svc.id}">
                <div class="addon-header">
                    <span class="addon-title">${svc.label}</span>
                    <label class="custom-switch">
                        <input type="checkbox" data-action="toggle-svc" data-id="${svc.id}" ${isActive ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
                <div id="svc-body-${svc.id}" style="display:${isActive ? 'block' : 'none'}; margin-top:10px;">
                    <div class="variant-row">
                        <span class="v-label">Количество (${svc.unit})</span>
                        <div class="v-controls">
                            <input type="number" class="qty-input" min="1" value="${qty}"
                                data-action="svc-qty" data-id="${svc.id}">
                        </div>
                    </div>
                    <div id="svc-hint-${svc.id}" style="font-size:12px; color:#888; margin-top:6px; text-align:right;"></div>
                    ${customPriceBlock}
                </div>
            </div>`;
        }).join('');

        this.updateServiceHints();
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
            const price = Calculator.getServicePrice(svc.priceKey);
            const qty   = State.data.services[svc.id] || 0;
            hint.textContent = (price > 0 && qty > 0)
                ? `${Helpers.fmt(price)} ₽ × ${qty} = ${Helpers.fmt(price * qty)} ₽`
                : '';
        });
    },

    // ── Рендер карточки тарифа ──
    renderTariffCard(meta) {
        const container = this.els['dynamic-content'];
        if (!meta) {
            container.innerHTML = `<div class="placeholder-text">Здесь будут параметры тарифа...<br><strong>Введите количество сотрудников</strong></div>`;
            return;
        }

        const isInd = State.data.subMode === 'individual';
        let bodyHTML = '';

        if (meta.type === 'promo') {
            bodyHTML = `
                <div class="detail-row"><span>Регион</span><strong>${meta.regionLabel}</strong></div>
                <div class="detail-row"><span>Количество сотрудников</span><strong>${Helpers.fmt(meta.employees)} чел.</strong></div>
                <div class="detail-row highlight"><span>Срок</span><strong>1 месяц</strong></div>
                <div class="detail-row highlight"><span>Стоимость</span><strong>0 ₽</strong></div>`;

        } else if (meta.type === 'monthly') {
            const priceBlock = isInd
                ? `<div class="price-edit-block">
                    <input type="number" class="tariff-field-input" min="0"
                        value="${State.data.customPrices['extra_monthly'] ?? meta.perEmp}"
                        data-action="custom-price" data-key="extra_monthly">
                    <span class="unit-text">₽</span>
                   </div>`
                : `<strong>${Helpers.fmt(meta.perEmp)} ₽</strong>`;

            bodyHTML = `
                <div class="detail-row"><span>Регион</span><strong>${meta.regionLabel}</strong></div>
                <div class="detail-row"><span>Количество сотрудников</span><strong>${Helpers.fmt(meta.employees)} чел.</strong></div>
                <div class="detail-row">
                    <span>Цена за 1 сотрудника/мес.</span>
                    ${priceBlock}
                </div>
                <div class="detail-row"><span>Стоимость в месяц</span><strong>${Helpers.fmt(meta.costPerMonth)} ₽</strong></div>
                <div class="detail-row highlight"><span>Срок</span><strong>${meta.months} мес.</strong></div>
                <div class="detail-row highlight"><span>Итого</span><strong>${Helpers.fmt(meta.costTotal)} ₽</strong></div>`;

        } else {
            const t = meta.tariff;
            const customKey = `${t.id}_${meta.region}_${meta.term}`;
            const priceBlock = isInd
                ? `<div class="price-edit-block">
                    <input type="number" class="tariff-field-input" min="0"
                        value="${State.data.customPrices[customKey] ?? meta.perEmp}"
                        data-action="custom-price" data-key="${customKey}">
                    <span class="unit-text">₽</span>
                   </div>`
                : `<strong>${Helpers.fmt(meta.perEmp)} ₽</strong>`;

            bodyHTML = `
                <div class="detail-row"><span>Регион</span><strong>${meta.regionLabel}</strong></div>
                <div class="detail-row"><span>Количество сотрудников</span><strong>${Helpers.fmt(meta.employees)} чел.</strong></div>
                <div class="detail-row"><span>Срок</span><strong>${meta.term} месяцев</strong></div>
                <div class="detail-row">
                    <span>Цена за 1 сотрудника</span>
                    ${priceBlock}
                </div>
                <div class="detail-row highlight"><span>Итого в месяц</span><strong>${Helpers.fmt(meta.totalMonth)} ₽</strong></div>
                <div class="detail-row highlight"><span>Итого за период</span><strong>${Helpers.fmt(meta.totalYear)} ₽</strong></div>`;
        }

        const labelText = meta.type === 'promo'   ? 'Промо'
                        : meta.type === 'monthly' ? 'Помесячный'
                        : meta.tariff.name;
        const titleText = meta.type === 'promo'   ? '0 ₽ — первый месяц'
                        : meta.type === 'monthly' ? `${meta.months} ${meta.months === 1 ? 'месяц' : meta.months < 5 ? 'месяца' : 'месяцев'}`
                        : meta.tariff.rangeLabel;

        const indClass = State.data.subMode === 'individual' ? ' individual-mode' : '';

        container.innerHTML = `
            <div class="tariff-card animated-fade${indClass}">
                <div class="tariff-header">
                    <span class="tariff-label">${labelText}</span>
                    <h3 class="tariff-title">${titleText}</h3>
                </div>
                <div class="detailing-section">${bodyHTML}</div>
            </div>`;
    },

    // ── Показать/скрыть блоки в зависимости от типа тарифа ──
    updateTariffTypeUI() {
        const type = State.data.tariffType;
        const termRow         = document.getElementById('term-row');
        const monthlyMonthsRow = document.getElementById('monthly-months-row');

        if (termRow)          termRow.style.display         = (type === 'main')    ? 'block' : 'none';
        if (monthlyMonthsRow) monthlyMonthsRow.style.display = (type === 'monthly') ? 'block' : 'none';
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

        if (act === 'set-submode') {
            btn.closest('.toggle-group').querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            State.data.subMode = btn.dataset.val;
            // Сброс кастомных цен при переключении на стандарт
            if (State.data.subMode === 'standard') {
                State.data.customPrices = {};
            }
            this.renderServicesHTML();
            this.update();
        }
        else if (act === 'set-region') {
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
        else if (act === 'set-tariff-type') {
            btn.closest('.toggle-group').querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            State.data.tariffType = btn.dataset.val;
            this.updateTariffTypeUI();
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
        else if (act === 'custom-price') {
            const key = t.dataset.key;
            const num = Helpers.parseNum(t.value);
            if (!isNaN(num) && num >= 0) {
                State.data.customPrices[key] = num;
            } else {
                delete State.data.customPrices[key];
            }
            // Пересчитываем без полного ре-рендера карточки (чтобы не сбить фокус)
            const result = Calculator.calculateAll();
            this.els['total-price'].textContent = Helpers.fmt(result.total) + ' ₽';
            this.els['details-content'].innerHTML = result.lines.length
                ? result.lines.join('<br>')
                : 'Введите данные для расчета...';
            this.updateServiceHints();
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
    UI.updateTariffTypeUI();

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

/**
 * Глобальные функции для кастомных цен сервисов
 */
window.updateSvcCustomPrice = (priceKey, value) => {
    const num = parseFloat(value);
    if (!isNaN(num) && num >= 0) {
        State.data.customPrices[`svc_${priceKey}`] = num;
    } else {
        delete State.data.customPrices[`svc_${priceKey}`];
    }
    const result = Calculator.calculateAll();
    document.getElementById('total-price').textContent = Helpers.fmt(result.total) + ' ₽';
    document.getElementById('details-content').innerHTML = result.lines.length
        ? result.lines.join('<br>')
        : 'Введите данные для расчета...';
    UI.updateServiceHints();
};

/**
 * 8. ГЕНЕРАЦИЯ PDF (КП)
 *
 * Структура:
 *   Страница 1 — pdf-header.jpg (только)
 *   Страница 2 — pdf-footer-1.jpg + заголовок + таблица расчёта + блок контактов
 *   Страница 3 — pdf-footer-2.jpg (только, если не влезло на стр.2)
 */
window.downloadKP = async function() {
    const result = Calculator.calculateAll();
    if (!result.meta && result.total === 0) {
        alert('Сначала сделайте расчёт!');
        return;
    }

    const partnerName  = document.getElementById('partner-name')?.value.trim()  || '';
    const partnerPhone = document.getElementById('partner-phone')?.value.trim() || '';
    const partnerEmail = document.getElementById('partner-email')?.value.trim() || '';
    const clientName   = document.getElementById('client-name')?.value.trim()   || 'Клиент';

    async function toBase64(url) {
        try {
            const res = await fetch(url);
            if (!res.ok) return '';
            const blob = await res.blob();
            return new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload  = () => resolve(r.result);
                r.onerror = reject;
                r.readAsDataURL(blob);
            });
        } catch { return ''; }
    }

    const [b64Header, b64Footer1, b64Footer2] = await Promise.all([
        toBase64('pdf-header.jpg'),
        toBase64('pdf-footer-1.jpg'),
        toBase64('pdf-footer-2.jpg'),
    ]);

    function parseLines(lines, meta) {
        const rows = [];
        lines.forEach(line => {
            if (line.startsWith('Тариф:') || line.startsWith('Помесячный') || line.startsWith('Промо')) {
                if (meta && meta.type === 'main') {
                    const termLabel = meta.term === 24 ? 'на 2 года' : 'на 1 год';
                    rows.push({
                        name:  `Лицензия для 1 сотрудника ${termLabel}`,
                        rate:  `${Helpers.fmt(meta.perEmp)} ₽`,
                        qty:   meta.employees,
                        total: `${Helpers.fmt(meta.totalYear)} ₽`,
                    });
                } else if (meta && meta.type === 'monthly') {
                    rows.push({
                        name:  `Помесячная лицензия (${meta.months} мес.)`,
                        rate:  `${Helpers.fmt(meta.perEmp)} ₽/мес.`,
                        qty:   meta.employees,
                        total: `${Helpers.fmt(meta.costTotal)} ₽`,
                    });
                } else if (meta && meta.type === 'promo') {
                    rows.push({ name: 'Промо-лицензия (1 месяц)', rate: '0 ₽', qty: meta.employees, total: '0 ₽' });
                }
                return;
            }
            const crossMatch = line.match(/^(.+?)\s*×\s*(\d+):\s*(.+)$/);
            if (crossMatch) {
                const name = crossMatch[1].trim();
                const qty  = parseInt(crossMatch[2]);
                const total = crossMatch[3].trim();
                const svc = CONSTANTS.SERVICES.find(s => name.includes(s.label) || s.label.includes(name.slice(0,20)));
                const unitPrice = svc ? Calculator.getServicePrice(svc.priceKey) : 0;
                rows.push({ name, rate: unitPrice > 0 ? `${Helpers.fmt(unitPrice)} ₽` : '—', qty, total });
            }
        });
        return rows;
    }

    const tableRows = parseLines(result.lines, result.meta);

    function buildTable(rows, clientName, total) {
        const PRIMARY  = '#7756ff';
        const ROW_EVEN = '#ffffff';
        const ROW_ODD  = '#faf8fc';
        const BORDER   = '#ede8ff';

        const dataRows = rows.map((row, i) => `
            <tr style="background:${i % 2 === 0 ? ROW_EVEN : ROW_ODD};">
                <td style="padding:13px 20px;font-size:9.5pt;color:#1a1a2e;border-bottom:1px solid ${BORDER};line-height:1.4;width:44%;">${row.name}</td>
                <td style="padding:13px 16px;font-size:9.5pt;color:#1a1a2e;border-bottom:1px solid ${BORDER};text-align:center;width:18%;">${row.rate}</td>
                <td style="padding:13px 16px;font-size:9.5pt;color:#1a1a2e;border-bottom:1px solid ${BORDER};text-align:center;width:18%;">${row.qty}</td>
                <td style="padding:13px 20px;font-size:9.5pt;font-weight:700;color:#1a1a2e;border-bottom:1px solid ${BORDER};text-align:right;width:20%;">${row.total}</td>
            </tr>`).join('');

        return `
            <div style="margin-top:16px;">
                <div style="font-size:17pt;font-weight:800;color:${PRIMARY};margin-bottom:18px;font-family:Montserrat,Arial,sans-serif;">
                    Расчёт для компании «${clientName}»
                </div>
                <table style="width:100%;border-collapse:separate;border-spacing:0;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(124,57,191,0.08);">
                    <thead>
                        <tr style="background:${PRIMARY};">
                            <th style="padding:14px 20px;text-align:left;color:#fff;font-size:9.5pt;font-weight:700;border-radius:14px 0 0 0;">Наименование</th>
                            <th style="padding:14px 16px;text-align:center;color:#fff;font-size:9.5pt;font-weight:700;">Тариф</th>
                            <th style="padding:14px 16px;text-align:center;color:#fff;font-size:9.5pt;font-weight:700;">Количество</th>
                            <th style="padding:14px 20px;text-align:right;color:#fff;font-size:9.5pt;font-weight:700;border-radius:0 14px 0 0;">Общая сумма</th>
                        </tr>
                    </thead>
                    <tbody>${dataRows}</tbody>
                    <tfoot>
                        <tr style="background:${PRIMARY};">
                            <td colspan="3" style="padding:14px 20px;color:#fff;font-size:10pt;font-weight:700;border-radius:0 0 0 14px;">Итого</td>
                            <td style="padding:14px 20px;color:#fff;font-size:11pt;font-weight:800;text-align:right;border-radius:0 0 14px 0;">${Helpers.fmt(total)} ₽</td>
                        </tr>
                    </tfoot>
                </table>
            </div>`;
    }

    function buildContacts(name, phone, email) {
        if (!name && !phone && !email) return '';
        return `
            <div style="margin-top:24px;border:1.5px solid #ede8ff;border-radius:14px;padding:16px 24px;display:flex;justify-content:space-between;align-items:center;background:#faf8fc;">
                <div>
                    <div style="font-size:10pt;font-weight:700;color:#7C39BF;margin-bottom:4px;">Остались вопросы? Свяжитесь с нами</div>
                    <div style="font-size:8.5pt;color:#888;">Готовы помочь с подключением сервиса</div>
                </div>
                <div style="text-align:right;font-size:9pt;color:#1a1a2e;line-height:1.8;">
                    ${name  ? `<div style="font-weight:700;">${name}</div>`  : ''}
                    ${phone ? `<div>${phone}</div>` : ''}
                    ${email ? `<div>${email}</div>` : ''}
                </div>
            </div>`;
    }

    const page1HTML = `
        <div style="width:794px;background:#fff;box-sizing:border-box;">
            ${b64Header ? `<img src="${b64Header}" style="width:794px;display:block;">` : ''}
        </div>`;

    async function measureHeight(htmlContent) {
        const div = document.createElement('div');
        div.style.cssText = 'position:absolute;top:-9999px;left:0;width:794px;background:#fff;visibility:hidden;';
        div.innerHTML = htmlContent;
        document.body.appendChild(div);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const h = div.scrollHeight;
        document.body.removeChild(div);
        return h;
    }

    async function renderPage(htmlContent) {
        const div = document.createElement('div');
        div.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;background:#fff;z-index:-1;pointer-events:none;';
        div.innerHTML = htmlContent;
        document.body.appendChild(div);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const canvas = await html2canvas(div, {
            scale: 2.5, useCORS: true, allowTaint: false,
            backgroundColor: '#ffffff', width: 794, height: div.scrollHeight, windowWidth: 794
        });
        document.body.removeChild(div);
        return canvas;
    }

    const A4_PX = 1123;

    const page2ContentHTML = `
        <div style="width:794px;background:#fff;box-sizing:border-box;font-family:Montserrat,Arial,sans-serif;">
            ${b64Footer1 ? `<img src="${b64Footer1}" style="width:794px;display:block;">` : ''}
            <div style="padding:18px 44px 40px;">
                ${buildTable(tableRows, clientName, result.total)}
                ${buildContacts(partnerName, partnerPhone, partnerEmail)}
            </div>
        </div>`;

    const footer2Block = b64Footer2
        ? `<div style="width:794px;"><img src="${b64Footer2}" style="width:794px;height:210px;display:block;"></div>`
        : '';

    const page2WithFooter2HTML = `
        <div style="width:794px;background:#fff;box-sizing:border-box;font-family:Montserrat,Arial,sans-serif;">
            ${b64Footer1 ? `<img src="${b64Footer1}" style="width:794px;display:block;">` : ''}
            <div style="padding:18px 44px 24px;">
                ${buildTable(tableRows, clientName, result.total)}
                ${buildContacts(partnerName, partnerPhone, partnerEmail)}
            </div>
            ${footer2Block}
        </div>`;

    const combinedHeight = await measureHeight(page2WithFooter2HTML);
    const useCombined = combinedHeight <= A4_PX;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(30,0,60,0.5);z-index:99998;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `<div style="background:#fff;padding:28px 40px;border-radius:14px;text-align:center;font-family:Arial,sans-serif;">
        <div style="font-size:26px;margin-bottom:10px;">📄</div>
        <div style="font-size:14px;font-weight:600;color:#6d28d9;">Создаём PDF...</div>
    </div>`;
    document.body.appendChild(overlay);

    try {
        const { jsPDF } = window.jspdf;
        const PDF_W = 595.28, PDF_H = 841.89;
        const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });

        const c1 = await renderPage(page1HTML);
        doc.addImage(c1.toDataURL('image/jpeg', 1.00), 'JPEG', 0, 0, PDF_W, Math.min((c1.height/c1.width)*PDF_W, PDF_H));

        doc.addPage();
        const p2html = useCombined ? page2WithFooter2HTML : page2ContentHTML;
        const c2 = await renderPage(p2html);
        doc.addImage(c2.toDataURL('image/jpeg', 1.00), 'JPEG', 0, 0, PDF_W, Math.min((c2.height/c2.width)*PDF_W, PDF_H));

        if (!useCombined && b64Footer2) {
            doc.addPage();
            const c3 = await renderPage(`<div style="width:794px;background:#fff;box-sizing:border-box;">
                <img src="${b64Footer2}" style="width:794px;display:block;">
            </div>`);
            doc.addImage(c3.toDataURL('image/jpeg', 1.00), 'JPEG', 0, 0, PDF_W, Math.min((c3.height/c3.width)*PDF_W, PDF_H));
        }

        doc.save(`КП Астрал.iКЭДО — ${clientName}.pdf`);
    } catch (err) {
        console.error('Ошибка PDF:', err);
        alert(`Ошибка создания PDF: ${err.message}`);
    } finally {
        document.body.removeChild(overlay);
    }
};