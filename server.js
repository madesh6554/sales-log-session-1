'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT) || 3100;
const MAX_PORT_ATTEMPTS = 10;
const PLACEHOLDER = 'postgresql://USER:PASSWORD@HOST:5432/DBNAME';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is not set. Add it to .env before starting ForgeLite.');
  process.exit(1);
}

if (connectionString === PLACEHOLDER) {
  console.warn('DATABASE_URL is still the placeholder from .env — saving will fail until it is replaced.');
}

const pool = new Pool({ connectionString });

const CREATE_TABLE = `
  create table if not exists sales (
    id            serial primary key,
    customer_name text      not null,
    phone         text,
    item          text      not null,
    amount        numeric   not null,
    sale_date     date      default current_date,
    source        text,
    created_at    timestamp default now()
  )
`;

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Mirrors the client-side rules in public/app.js. Anything can POST here directly,
// so the checks cannot live in the browser alone.
function validate(body) {
  const errors = {};

  const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : '';
  if (!customerName) {
    errors.customerName = 'Customer name is required.';
  }

  const item = typeof body.item === 'string' ? body.item.trim() : '';
  if (!item) {
    errors.item = 'Item is required.';
  }

  const amount = body.amount === undefined || body.amount === null ? '' : String(body.amount).trim();
  if (!amount) {
    errors.amount = 'Amount is required.';
  } else if (!Number.isFinite(Number(amount))) {
    errors.amount = 'Amount must be a number.';
  }

  return errors;
}

function optional(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed === '' ? null : trimmed;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Anything that is not a plain YYYY-MM-DD becomes null, which the query reads as
// "no bound" — a malformed param returns everything rather than erroring.
function dateParam(value) {
  return typeof value === 'string' && ISO_DATE.test(value) ? value : null;
}

app.get('/api/sales', async (req, res) => {
  try {
    // sale_date is cast to text in SQL: letting the driver hand back a Date would
    // JSON-serialize to UTC and display the previous day for anyone east of UTC.
    const result = await pool.query(
      `select id,
              to_char(sale_date, 'YYYY-MM-DD') as sale_date,
              customer_name,
              item,
              amount,
              source
       from sales
       where ($1::date is null or sale_date >= $1::date)
         and ($2::date is null or sale_date <= $2::date)
       order by sale_date desc, id desc`,
      [dateParam(req.query.from), dateParam(req.query.to)]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Read failed:', err.message);
    res.status(500).json({ message: 'Could not load sales.' });
  }
});

// Summed in SQL rather than in the browser so the figure stays correct however
// many rows exist, and stays independent of whatever the list is filtered to.
app.get('/api/sales/total', async (req, res) => {
  try {
    const result = await pool.query(
      `select coalesce(sum(amount), 0) as total
       from sales
       where ($1::date is null or sale_date >= $1::date)
         and ($2::date is null or sale_date <= $2::date)`,
      [dateParam(req.query.from), dateParam(req.query.to)]
    );
    res.json({ total: result.rows[0].total });
  } catch (err) {
    console.error('Total failed:', err.message);
    res.status(500).json({ message: 'Could not load the total.' });
  }
});

app.post('/api/sales', async (req, res) => {
  const errors = validate(req.body);
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  const values = [
    req.body.customerName.trim(),
    optional(req.body.phone),
    optional(req.body.item),
    Number(String(req.body.amount).trim()),
    optional(req.body.saleDate),
    optional(req.body.source)
  ];

  try {
    const result = await pool.query(
      `insert into sales (customer_name, phone, item, amount, sale_date, source)
       values ($1, $2, $3, $4, coalesce($5::date, current_date), $6)
       returning id`,
      values
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    console.error('Insert failed:', err.message);
    res.status(500).json({ message: 'Could not save the sale. Check the server console.' });
  }
});

async function ensureSchema() {
  try {
    await pool.query(CREATE_TABLE);
    console.log('sales table is ready.');
  } catch (err) {
    // Serve the page anyway so the failure is visible in the UI rather than a dead port.
    console.error('Could not prepare the sales table:', err.message);
    console.error('ForgeLite will start, but saving will fail until the database is reachable.');
  }
}

// Walk up to the next free port if the preferred one is taken, so a stray
// listener never blocks startup. Only EADDRINUSE is retried; anything else throws.
function listen(port, attemptsLeft) {
  const server = app.listen(port, () => {
    console.log(`ForgeLite running at http://localhost:${port}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.warn(`Port ${port} is busy, trying ${port + 1}...`);
      listen(port + 1, attemptsLeft - 1);
    } else {
      throw err;
    }
  });
}

ensureSchema().then(() => listen(PORT, MAX_PORT_ATTEMPTS));
