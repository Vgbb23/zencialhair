import dotenv from "dotenv";
import express from "express";
import { handleOrderGet, handlePixChargePost } from "../../api/lib/fruitfyBridge.js";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const app = express();
app.use(express.json());

const PORT = Number(process.env.API_PORT || 3001);

app.post("/api/pix/charge", async (req, res) => {
  const out = await handlePixChargePost(req.body);
  res.status(out.status).json(out.body);
});

app.get("/api/order/:orderId", async (req, res) => {
  const out = await handleOrderGet(req.params.orderId);
  res.status(out.status).json(out.body);
});

const server = app.listen(PORT, () => {
  console.log(`Fruitfy API bridge rodando na porta ${PORT}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Porta ${PORT} ja em uso (outro npm run dev?). Feche o processo ou defina outra API_PORT no .env.local.`,
    );
    process.exit(1);
  }
  throw err;
});
