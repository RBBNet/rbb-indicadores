@echo off
:menu
cls
echo ==========================================
echo          Menu de Ferramentas RBB
echo ==========================================
echo 1. Metricas de Producao de Blocos
echo 2. Estatisticas do Tempo de Producao de Blocos
echo 3. Acompanhamento das Iniciativas de Maturacao do Piloto
echo 4. Issues em Producao
echo 5. Sair
echo ==========================================
set /p choice=Escolha uma opcao (1-5): 

if %choice%==1 goto blockMetrics
if %choice%==2 goto blockAnalytics
if %choice%==3 goto projectMetrics
if %choice%==4 goto issueMetrics
if %choice%==5 goto end

:blockMetrics
set /p startDate=Digite a data inicial (DD/MM/AAAA): 
set /p endDate=Digite a data final (DD/MM/AAAA): 
set /p provider=Digite o endereco do provider JSON-RPC (Ex: http://localhost:8545): 
set /p nodesPath=Digite o caminho para os arquivos nodes.json (Ex: Blocks/node): 
node Blocks\block-metrics.js %startDate% %endDate% %provider% %nodesPath%
pause
goto menu

:blockAnalytics
set /p refMonth=Digite o mes de referencia (MM): 
set /p refYear=Digite o ano de referencia (AAAA): 
set defaultPath=\\bndes.net\bndes\Grupos\BNDES Blockchain\RBB\Infra\DadosPiloto\%refYear%-%refMonth%\blocks%refYear%-%refMonth%.csv
echo.
echo Caminho padrao sugerido:
echo %defaultPath%
echo.
set /p useDefault=Deseja usar este caminho? (S/N): 
if /i "%useDefault%"=="S" (
    set blocksPath=%defaultPath%
) else (
    set /p blocksPath=Digite o caminho completo do arquivo CSV de blocos: 
)

echo.
echo Verificando se o arquivo existe...
if not exist "%blocksPath%" (
    echo ERRO: Arquivo nao encontrado: %blocksPath%
    pause
    goto menu
)

echo Arquivo encontrado. Copiando para pasta local...
set localPath=Blocks\blocks%refYear%-%refMonth%.csv
copy "%blocksPath%" "%localPath%" >nul
if errorlevel 1 (
    echo ERRO: Falha ao copiar o arquivo.
    pause
    goto menu
)

echo Copia concluida. Processando estatisticas...
mkdir result 2>nul
node Blocks\block-analytics.js "%localPath%" > result\Blocos-estat.txt
if errorlevel 1 (
    echo ERRO: Falha ao processar o arquivo.
    pause
    goto menu
)

echo.
echo Processamento concluido!
echo Resultado salvo em: result\Blocos-estat.txt
echo Arquivo temporario: %localPath%
echo.
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