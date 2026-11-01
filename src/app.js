const express = require("express");
const cors = require("cors");
const path = require("path");

const { env } = require("./config/env");
const requestContext = require("./shared/middlewares/requestContext");
const {
  errorHandler,
  notFoundHandler
} = require("./shared/middlewares/errorHandler");

const restaurantRoutes = require("./modules/restaurants/restaurant.routes");
const authRoutes = require("./modules/auth/auth.routes");
const dishRoutes = require("./modules/dishes/dish.routes");
const { OTIMIZADAS } = require("./modules/shared/image.service");
const healthRoutes = require("./modules/health/health.routes");

const app = express();

app.set("trust proxy", 1);

app.disable("x-powered-by");

app.use(requestContext);

app.use(
  cors({
    origin: env.corsOrigins.length ? env.corsOrigins : true,
    credentials: true,
    exposedHeaders: ["x-request-id", "Location"]
  })
);

app.use(express.json({ limit: "100kb" }));

app.use(express.static(path.join(__dirname, "../public")));

app.use("/uploads", express.static(OTIMIZADAS, { maxAge: "7d", immutable: true }));

app.use("/health", healthRoutes);

const v1 = express.Router();
v1.use("/auth", authRoutes);
v1.use("/restaurants", restaurantRoutes);
v1.use("/dishes", dishRoutes);

app.use("/api/v1", v1);

app.use("/restaurants", restaurantRoutes);
app.use("/auth", authRoutes);
app.use("/dishes", dishRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
