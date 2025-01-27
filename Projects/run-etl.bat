@echo off

cd Projects
node fetch-metrics.js
python -m pipeline
cd ..