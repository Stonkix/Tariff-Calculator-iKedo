/**
 * 1. КОНФИГУРАЦИЯ И ТАРИФЫ
 */
const TARIFFS = [
    {
        id:        'starter',
        name:      'Стартовый',
        minEmp:    1,
        maxEmp:    299,
        rangeLabel:'от 1 до 299 сотрудников',
        prices: {
            moscow: 900,
            other:  750
        }
    },
    {
        id:        'standard',
        name:      'Стандартный',
        minEmp:    300,
        maxEmp:    2999,
        rangeLabel:'от 300 до 2 999 сотрудников',
        prices: {
            moscow: 700,
            other:  580
        }
    },
    {
        id:        'corporate',
        name:      'Корпоративный',
        minEmp:    3000,
        maxEmp:    9999,
        rangeLabel:'от 3 000 до 9 999 сотрудников',
        prices: {
            moscow: 500,
            other:  420
        }
    },
    {
        id:        'enterprise',
        name:      'Энтерпрайз',
        minEmp:    10000,
        maxEmp:    Infinity,
        rangeLabel:'от 10 000 сотрудников',
        prices: {
            moscow: 380,
            other:  300
        }
    }
];

/**
 * 2. СОСТОЯНИЕ
 */
const State = {
    data: {
        region:    'moscow',
        employees: 0,
    }
};

/**
 * 3. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
 */
const Helpers = {
    fmt: (num) => Math.round(num).toLocaleString('ru-RU'),

    getTariff(employees) {
        if (!employees || employees <= 0) return null;
        return TARIFFS.find(t => employees >= t.minEmp && employees <= t.maxEmp) || null;
    }
};

/**
 * 4. ЛОГИКА РАСЧЁТА
 */
const Calculator = {
    calculateAll() {
        const { employees, region } = State.data;
        const tariff = Helpers.getTariff(employees);
        if (!tariff) return { total: 0, lines: [], meta: null };

        const perEmp     = tariff.prices[region];
        const totalYear  = employees * perEmp;
        const totalMonth = Math.round(totalYear / 12);

        const lines = [
            `Тариф: ${tariff.name} | ${tariff.rangeLabel}`,
            `Регион: ${region === 'moscow' ? 'Москва и Московская область' : 'Другие регионы'}`,
            `Сотрудников: ${Helpers.fmt(employees)} чел.`,
            `Цена за 1 сотрудника: ${Helpers.fmt(perEmp)} ₽/год`,
            `Итого в год: ${Helpers.fmt(totalYear)} ₽`,
            `Итого в месяц: ${Helpers.fmt(totalMonth)} ₽`,
        ];

        return {
            total: totalYear,
            lines,
            meta: { tariff, perEmp, totalYear, totalMonth, employees, region }
        };
    }
};

/**
 * 5. ОТРИСОВКА (UI)
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

        const act = btn.dataset.click;

        if (act === 'set-region') {
            const group = btn.closest('.toggle-group');
            group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            State.data.region = btn.dataset.val;
            this.update();
        }
    },

    handleInput(e) {
        const t   = e.target;
        const act = t.dataset.action;

        if (act === 'employees') {
            State.data.employees = parseInt(t.value) || 0;
            this.update();
        }
    },

    update() {
        const result = Calculator.calculateAll();

        // Итог
        this.els['total-price'].textContent = Helpers.fmt(result.total) + ' ₽';

        // Детализация
        this.els['details-content'].innerHTML = result.lines.length
            ? result.lines.join('<br>')
            : 'Введите данные для расчета...';

        // Карточка тарифа
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
                        <span>Цена за 1 сотрудника в год</span>
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
 * 6. СТАРТ
 */
document.addEventListener('DOMContentLoaded', () => {
    UI.init();
});