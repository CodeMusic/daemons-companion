idf_component_register(
    SRCS "app_main.c" "daemons_ao.c" "routines.c" "companion.c" "den.c"
    INCLUDE_DIRS "."
    REQUIRES kode
    PRIV_REQUIRES kscreen espressif__cjson esp_hw_support
)
