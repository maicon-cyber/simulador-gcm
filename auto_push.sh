#!/bin/bash

echo "Iniciando Piloto Automático do Git..."
echo "Aperte CTRL+C para parar."

while true; do
    # Verifica se há alguma alteração nos arquivos
    if [[ `git status --porcelain` ]]; then
        echo "Alterações detectadas! Sincronizando com o GitHub..."
        git add .
        git commit -m "Auto-save: $(date +'%d/%m/%Y %H:%M:%S')"
        git push origin main
        echo "Sincronização concluída!"
    fi
    # Espera 30 segundos antes de checar de novo
    sleep 30
done
