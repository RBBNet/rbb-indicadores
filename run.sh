export LANG=pt_BR.UTF-8
while true; do
    clear
    echo "=========================================="
    echo "         Menu de Ferramentas RBB"
    echo "=========================================="
    echo "1. Métricas de Produção de Blocos"
    echo "2. Estatísticas do Tempo de Produção de Blocos"
    echo "3. Acompanhamento das Iniciativas de Maturação do Piloto"
    echo "4. Issues em Produção"
    echo "5. Sair"
    echo "=========================================="
    read -p "Escolha uma opção (1-5): " choice

    case $choice in
        1)
            read -p "Digite a data inicial (DD/MM/AAAA): " startDate
            read -p "Digite a data final (DD/MM/AAAA): " endDate
            read -p "Digite o endereço do provider JSON-RPC (Ex: http://localhost:8545): " provider
            read -p "Digite o caminho para os arquivos nodes.json (Ex: Blocks/node): " nodesPath
            node Blocks/block-metrics.js $startDate $endDate $provider $nodesPath
            read -p "Pressione qualquer tecla para continuar..."
            ;;

        2)
            read -p "Digite o caminho para o arquivo CSV de iniciativas (Ex: C:\DadosCSV\2025-01\Blocks2025-01.csv):" initiativesPath
            node Blocks/block-analytics.js $initiativesPath
            read -p "Pressione qualquer tecla para continuar..."
            ;;

        3)
            read -p "Digite o período de referência (MM/AAAA): " refPeriod
            read -p "Digite o caminho para o arquivo CSV de iniciativas (Ex: Projects/tmp/arquivo.csv): " initiativesPath
            node Projects/project-metrics.js $refPeriod $initiativesPath
            read -p "Pressione qualquer tecla para continuar..."
            ;;
        4)
            read -p "Digite a data inicial (DD/MM/AAAA): " startDate
            read -p "Digite a data final (DD/MM/AAAA): " endDate
            node Issues/issue-metrics.js $startDate $endDate
            read -p "Pressione qualquer tecla para continuar..."
            ;;
        5)
            echo "Saindo..."
            break
            ;;
        *)
            echo "Opção inválida!"
            read -p "Pressione qualquer tecla para continuar..."
            ;;
    esac
done