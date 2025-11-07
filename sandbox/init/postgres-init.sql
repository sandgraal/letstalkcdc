-- Initialize Postgres with sample inventory database
-- This script creates tables and populates them with sample data

-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description VARCHAR(512),
  weight FLOAT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  customer_id INTEGER REFERENCES customers(id),
  status VARCHAR(50) DEFAULT 'pending',
  total_amount DECIMAL(10,2)
);

-- Create order_items table
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  product_id INTEGER REFERENCES products(id),
  quantity INTEGER NOT NULL,
  price DECIMAL(10,2) NOT NULL
);

-- Insert sample products
INSERT INTO products (name, description, weight) VALUES
  ('Laptop', 'High-performance laptop', 2.5),
  ('Mouse', 'Wireless optical mouse', 0.1),
  ('Keyboard', 'Mechanical keyboard', 0.8),
  ('Monitor', '27-inch 4K display', 5.5),
  ('Headphones', 'Noise-cancelling headphones', 0.3);

-- Insert sample customers
INSERT INTO customers (first_name, last_name, email) VALUES
  ('John', 'Doe', 'john.doe@example.com'),
  ('Jane', 'Smith', 'jane.smith@example.com'),
  ('Bob', 'Johnson', 'bob.johnson@example.com'),
  ('Alice', 'Williams', 'alice.williams@example.com'),
  ('Charlie', 'Brown', 'charlie.brown@example.com');

-- Insert sample orders
INSERT INTO orders (customer_id, status, total_amount) VALUES
  (1, 'completed', 1299.99),
  (2, 'pending', 45.98),
  (3, 'shipped', 899.99),
  (4, 'completed', 299.99),
  (5, 'pending', 129.99);

-- Insert sample order items
INSERT INTO order_items (order_id, product_id, quantity, price) VALUES
  (1, 1, 1, 1299.99),
  (2, 2, 1, 19.99),
  (2, 3, 1, 25.99),
  (3, 4, 1, 899.99),
  (4, 5, 1, 299.99),
  (5, 3, 1, 129.99);

-- Output confirmation
SELECT 'Database initialized successfully!' as message;
SELECT COUNT(*) as product_count FROM products;
SELECT COUNT(*) as customer_count FROM customers;
SELECT COUNT(*) as order_count FROM orders;
