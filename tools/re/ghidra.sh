#!/bin/sh
# Ghidra + bethington/ghidra-mcp's headless server for this container: decompile
# game binaries for 1:1 rewrites. Idempotent; installs to $RE_HOME (default
# ~/.cache/re). The server is a REST API on 127.0.0.1:8089 (curl it; see
# tools/re/README.md). Needs Java 21 and Maven (both in this image).
#   tools/re/ghidra.sh            install if needed, then start the server
#   tools/re/ghidra.sh stop
set -e
GV=12.1.3; GD=20260817
R="${RE_HOME:-$HOME/.cache/re}"
G="$R/ghidra_${GV}_PUBLIC"
M="$R/ghidra-mcp"
PORT="${GHIDRA_MCP_PORT:-8089}"
if [ "$1" = stop ]; then pkill -f GhidraMCPHeadlessServer || true; exit 0; fi
mkdir -p "$R"
if [ ! -d "$G" ]; then
  echo "downloading Ghidra $GV..."
  curl -fsSL -o "$R/ghidra.zip" "https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_${GV}_build/ghidra_${GV}_PUBLIC_${GD}.zip"
  (cd "$R" && unzip -q ghidra.zip && rm ghidra.zip)
fi
if [ ! -d "$M" ]; then git clone -q --depth 1 https://github.com/bethington/ghidra-mcp "$M"; fi
JAR="$(ls "$M"/target/GhidraMCP-*.jar 2>/dev/null | head -1)"
if [ -z "$JAR" ]; then
  echo "building ghidra-mcp..."
  for p in Framework/Generic Framework/SoftwareModeling Framework/Project Framework/Docking Framework/Utility Framework/Gui \
           Framework/FileSystem Framework/Help Features/Base Features/Decompiler Framework/DB Framework/Emulation Framework/Graph \
           Debug/Debugger-api Debug/Framework-TraceModeling Debug/Debugger-rmi-trace; do
    a="${p##*/}"
    mvn -q install:install-file -Dfile="$G/Ghidra/$p/lib/$a.jar" -DgroupId=ghidra -DartifactId="$a" -Dversion=$GV -Dpackaging=jar
  done
  (cd "$M" && mvn clean package -P headless -DskipTests -q)
  JAR="$(ls "$M"/target/GhidraMCP-*.jar | head -1)"
fi
if curl -sf "http://127.0.0.1:$PORT/check_connection" >/dev/null 2>&1; then echo "already running on $PORT"; exit 0; fi
CP="$JAR"
for j in "$G"/Ghidra/Framework/*/lib/*.jar "$G"/Ghidra/Features/*/lib/*.jar "$G"/Ghidra/Processors/*/lib/*.jar; do CP="$CP:$j"; done
mkdir -p "$R/projects"
nohup java -Xmx3g -XX:+UseG1GC -Dghidra.home="$G" -Dapplication.name=GhidraMCP -classpath "$CP" \
  com.xebyte.headless.GhidraMCPHeadlessServer --port "$PORT" --bind 127.0.0.1 >"$R/server.log" 2>&1 &
for i in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:$PORT/check_connection" >/dev/null 2>&1; then echo "Ghidra MCP headless server on 127.0.0.1:$PORT (log $R/server.log)"; exit 0; fi
  sleep 2
done
echo "server didn't start; see $R/server.log"; tail -20 "$R/server.log"; exit 1
