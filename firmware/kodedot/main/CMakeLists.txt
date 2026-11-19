idf_component_register(
    SRCS "app_main.c" "daemons_ao.c" "routines.c"
    INCLUDE_DIRS "."
    REQUIRES kode
    PRIV_REQUIRES kscreen
)
