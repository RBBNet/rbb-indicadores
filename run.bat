@echo off
:menu
cls
echo ==========================================
echo          Menu de Ferramentas RBB
echo ==========================================
echo 1. Metricas de Producao de Blocos
echo 2. Acompanhamento das Iniciativas de Maturacao do Piloto
echo 3. Issues em Producao
echo 4. Sair
echo ==========================================
set /p choice=Escolha uma opcao (1-4): 

if %choice%==1 goto blockMetrics
if %choice%==2 goto projectMetrics
if %choice%==3 goto issueMetrics
if %choice%==4 goto end

:blockMetrics
set /p startDate=Digite a data inicial (DD/MM/AAAA): 
set /p endDate=Digite a data final (DD/MM/AAAA): 
set /p provider=Digite o endereço do provider JSON-RPC (Ex: http://localhost:8545): 
set /p nodesPath=Digite o caminho para os arquivos nodes.json (Ex: Blocks/node): 
node Blocks\block-metrics.js %startDate% %endDate% %provider% %nodesPath%
pause
goto menu

:projectMetrics
set /p refPeriod=Digite o periodo de referencia (MM/AAAA): 
set /p initiativesPath=Digite o caminho para o arquivo CSV de iniciativas (Ex: Projects/tmp/arquivo.csv): 
node Projects\project-metrics.js %refPeriod% %initiativesPath%
pause
goto menu

:issueMetrics
set /p startDate=Digite a data inicial (DD/MM/AAAA): 
set /p endDate=Digite a data final (DD/MM/AAAA): 
node Issues\issue-metrics.js %startDate% %endDate%
pause
goto menu

:end
echo Saindo...
goto :eof

:exit
exit