#!/usr/bin/env bash
# Source this file; do not change HOME or system runtimes.
export DOTNET_ROOT=/workspace/tooling/dotnet
export PATH="$DOTNET_ROOT:$PATH"
export DOTNET_CLI_HOME=/workspace/tooling/dotnet-home
export NUGET_PACKAGES=/workspace/tooling/nuget
export DOTNET_CLI_TELEMETRY_OPTOUT=1
export npm_config_cache=/workspace/tooling/npm-cache
