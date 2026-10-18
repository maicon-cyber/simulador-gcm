#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null)" || {
    echo "Erro: execute este script dentro de um repositório Git." >&2
    exit 1
}
cd "$ROOT_DIR"

BRANCH="$(git branch --show-current)"
if [[ -z "$BRANCH" ]]; then
    echo "Erro: não é possível enviar alterações com HEAD destacado." >&2
    exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
    echo "Erro: o repositório não possui um remoto chamado 'origin'." >&2
    exit 1
fi

git add -A

if git diff --cached --quiet; then
    echo "Nenhuma alteração para enviar."
    exit 0
fi

echo "Alterações que serão enviadas:"
git diff --cached --stat
git commit -m "Atualização automática do painel"
git push -u origin "$BRANCH"

echo "Atualização enviada para origin/$BRANCH."
