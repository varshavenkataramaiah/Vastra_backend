require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const Product = require('./models/Product');
const seedProducts = require('./data/seedProducts');
const userRoutes = require('./routes/userRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

const initializeDatabase = async () => {
  await connectDB();
  const productCount = await Product.countDocuments();
  if (productCount === 0) {
    await Product.insertMany(seedProducts);
    console.log(`Seeded ${seedProducts.length} products`);
  }
};

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Vastra backend is running',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Database initialization failed:', error.message);
    process.exit(1);
  });
