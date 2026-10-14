const express = require("express");
const mysql = require("mysql2");
var cors = require('cors')

const app = express();
// Middleware
app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
  res.send("Hello World");
});

// Connection Database
const query = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "shopping",
});

// ADD PRODUCT
app.post("/products", (req, res) => {
  const { name, price, desc } = req.body;
  query.execute(
    `insert into products (name , price , description) value ('${name}','${price}','${desc}')`,
    (err, data) => {
      if (err) {
        res.status(500).json({ message: "Error adding product", err });
      } else {
        res.status(200).json({ message: "Product added successfully", data });
      }
    },
  );
});

// GET ALL PRODUCT
app.get("/products", (req, res) => {
  query.execute(`select * from products`, (err, data) => {
    if (err) {
      console.error(err);
      res.status(500).json({ message: "Error fetching products", err });
    } else {
      res.json({ message: "Products fetched successfully", data });
    }
  });
});

// GET  PRODUCT BY ID
app.get("/products/:id", (req, res) => {
  const { id } = req.params;
  query.execute(`select * from products where id = ${id}`, (err, data) => {
    if (err) {
      console.error(err);
      res.status(500).json({ message: "Error fetching product", err });
    } else {
      res.json({ message: "Product fetched successfully", data });
    }
  });
});
// DELETE PRODUCTS
app.delete("/products/:id", (req, res) => {
  const { id } = req.params;
  query.execute(`delete from products where id= ${id}`, (err, data) => {
    if (err) {
      console.error(err);
      res.status(500).json({ message: "Error deleting product", err });
    } else {
      res.json({ message: "Product deleted successfully", data });
    }
  });
});

app.put("/products/:id", (req, res) => {
  const { id } = req.params;
  const { name, price, desc } = req.body;

  query.execute(
    `update products set name = '${name}', price = '${price}', description = '${desc}' where id= ${id}`,
    (err, data) => {
      if (err) {
        console.error(err);
        res.status(500).json({ message: "Error updating product", err });
      } else {
        res.json({ message: "Product updated successfully"});
      }
    },
  );
});

app.listen(4000, () => {
  console.log("server is running on port 4000");
});
