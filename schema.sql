-- ForgeLite sales table.
-- server.js applies this automatically on startup; kept here to run by hand if preferred.

create table if not exists sales (
  id            serial primary key,
  customer_name text      not null,
  phone         text,
  item          text      not null,
  amount        numeric   not null,
  sale_date     date      default current_date,
  source        text,
  created_at    timestamp default now()
);
