# C-541: the system the Pi program is built in -- Debian 13 on arm64, the boards' own -- for a volunteer host of DAEMONS
# Server. The same packages as .github/workflows/pizero.yml's Tools step: change both together.
FROM debian:trixie
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends \
      git cmake g++ ninja-build pkg-config libcurl4-openssl-dev device-tree-compiler dpkg-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*
