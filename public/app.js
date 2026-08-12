'use strict';

const form = document.getElementById('sale-form');
const button = document.getElementById('save');
const status = document.getElementById('status');
const table = document.getElementById('sales-table');
const tbody = document.getElementById('sales-body');
const empty = document.getElementById('empty');
const monthTotal = document.getElementById('month-total');
const fromDate = document.getElementById('fromDate');
const toDate = document.getElementById('toDate');
const applyButton = document.getElementById('apply');
const thisMonthButton = document.getElementById('this-month');

const rupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2
});

// Local date, not toISOString() — that converts to UTC and can land on yesterday.
function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function setDefaults() {
  form.saleDate.value = today();
}

function pad(value) {
  return String(value).padStart(2, '0');
}

// First and last day of the current month, from local date parts. Day 0 of the
// next month is the last day of this one, and it handles leap years for free.
function thisMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();

  return {
    from: `${year}-${pad(month + 1)}-01`,
    to: `${year}-${pad(month + 1)}-${pad(lastDay)}`
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-08-12" -> "12 Aug 2026". Built from the parts rather than new Date(string),
// which parses an ISO date as UTC midnight and renders the previous day west of UTC.
function formatDate(iso) {
  const [year, month, day] = String(iso).split('-').map(Number);
  if (!year || !month || !day) {
    return iso;
  }
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

// Cells are set via textContent, never innerHTML — customer names and items are
// user-typed and would otherwise make this form a stored-XSS vector.
function cell(row, text, className) {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) {
    td.className = className;
  }
  row.appendChild(td);
}

// Source renders as a pill; blank renders as a dash rather than an empty pill.
function sourceCell(row, source) {
  const td = document.createElement('td');
  const text = typeof source === 'string' ? source.trim() : '';

  if (text) {
    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.textContent = text;
    td.appendChild(pill);
  } else {
    td.textContent = '—';
    td.className = 'dash';
  }

  row.appendChild(td);
}

function renderSales(sales) {
  tbody.textContent = '';

  if (sales.length === 0) {
    const filtered = Boolean(fromDate.value || toDate.value);
    empty.textContent = filtered ? 'No sales in this range' : 'No sales yet';
    table.hidden = true;
    empty.hidden = false;
    return;
  }

  for (const sale of sales) {
    const row = document.createElement('tr');
    cell(row, formatDate(sale.sale_date), 'date');
    cell(row, sale.customer_name);
    cell(row, sale.item);
    cell(row, rupees.format(Number(sale.amount)), 'numeric');
    sourceCell(row, sale.source);
    tbody.appendChild(row);
  }

  empty.hidden = true;
  table.hidden = false;
}

// Always the current calendar month, deliberately ignoring the list filter.
async function loadTotal() {
  const range = thisMonthRange();

  try {
    const response = await fetch(`/api/sales/total?from=${range.from}&to=${range.to}`);
    if (!response.ok) {
      throw new Error('request failed');
    }
    const body = await response.json();
    monthTotal.textContent = rupees.format(Number(body.total));
  } catch (err) {
    monthTotal.textContent = '—';
  }
}

async function loadSales() {
  const params = new URLSearchParams();
  if (fromDate.value) {
    params.set('from', fromDate.value);
  }
  if (toDate.value) {
    params.set('to', toDate.value);
  }

  const query = params.toString();

  try {
    const response = await fetch(query ? `/api/sales?${query}` : '/api/sales');
    if (!response.ok) {
      throw new Error('request failed');
    }
    renderSales(await response.json());
  } catch (err) {
    setStatus('Could not load the sales list.', 'failed');
  }
}

function showErrors(errors) {
  for (const name of ['customerName', 'item', 'amount']) {
    const message = errors[name] || '';
    document.getElementById(`${name}-error`).textContent = message;
    form[name].classList.toggle('invalid', Boolean(message));
  }
}

function setStatus(text, kind) {
  status.textContent = text;
  status.className = kind ? `status ${kind}` : 'status';
}

// Mirrors validate() in server.js.
function validate(values) {
  const errors = {};

  if (!values.customerName) {
    errors.customerName = 'Customer name is required.';
  }

  if (!values.item) {
    errors.item = 'Item is required.';
  }

  if (!values.amount) {
    errors.amount = 'Amount is required.';
  } else if (!Number.isFinite(Number(values.amount))) {
    errors.amount = 'Amount must be a number.';
  }

  return errors;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('');

  const values = {
    customerName: form.customerName.value.trim(),
    phone: form.phone.value.trim(),
    item: form.item.value.trim(),
    amount: form.amount.value.trim(),
    saleDate: form.saleDate.value,
    source: form.source.value.trim()
  };

  const errors = validate(values);
  showErrors(errors);

  const firstError = Object.keys(errors)[0];
  if (firstError) {
    form[firstError].focus();
    return;
  }

  button.disabled = true;

  try {
    const response = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values)
    });

    if (response.ok) {
      form.reset();
      setDefaults();
      showErrors({});
      setStatus('Saved', 'saved');
      form.customerName.focus();
      loadSales();
      loadTotal();
      return;
    }

    const body = await response.json().catch(() => ({}));

    if (response.status === 400 && body.errors) {
      showErrors(body.errors);
    } else {
      setStatus(body.message || 'Could not save.', 'failed');
    }
  } catch (err) {
    setStatus('Could not reach the server.', 'failed');
  } finally {
    button.disabled = false;
  }
});

applyButton.addEventListener('click', () => {
  loadSales();
});

thisMonthButton.addEventListener('click', () => {
  const range = thisMonthRange();
  fromDate.value = range.from;
  toDate.value = range.to;
  loadSales();
});

setDefaults();
loadSales();
loadTotal();
