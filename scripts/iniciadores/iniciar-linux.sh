#!/bin/sh
# PULSO — Inicialização do pacote portátil (Linux).
# Uso:  ./iniciar/iniciar-linux.sh [argumentos do PULSO]
# O script sobe para a raiz do pacote e executa Linux/PULSO.

cd "$(dirname "$0")/.." || exit 1

if [ -x "./Linux/PULSO" ]; then
  exec "./Linux/PULSO" "$@"
fi

echo "PULSO: o executável Linux/PULSO não foi encontrado no pacote." >&2
exit 1
