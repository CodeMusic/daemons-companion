# mlx90640

Melexis's own MLX90640 driver -- [melexis/mlx90640-library](https://github.com/melexis/mlx90640-library) at commit
`f6be7ca1d4a55146b705f3d347f84b773b29cc86` (`functions/MLX90640_API.c`, `headers/MLX90640_API.h`,
`headers/MLX90640_I2C_Driver.h`), unchanged, under the Apache License 2.0 (`LICENSE`, and each file's header). Its
I2C functions are this firmware's own, on the second I2C port (`src/glow.cpp`). The M5StickC-Plus's Thermal HAT (U062)
is read through it: GLOW, companion C-148.
