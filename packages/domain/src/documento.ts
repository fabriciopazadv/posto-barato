/**
 * CPF/CNPJ do pagador — validação pura, sem banco e sem rede.
 *
 * Por que isto existe: o Asaas exige `cpfCnpj` para criar o cliente, e o Posto
 * Barato não coleta documento no cadastro (diferente do mei-facil, onde o CNPJ
 * vem do perfil do MEI). Sem o documento em mãos na virada do teste, o cron não
 * consegue criar a cobrança e o usuário fica bloqueado até assinar de novo pela
 * tela. Por isso o documento é pedido **no momento em que a pessoa escolhe o
 * plano**, ainda durante o teste — é o que torna a virada automática.
 *
 * Validar aqui, e não só no servidor, tem um motivo prático: o Asaas recusa
 * documento inválido com erro genérico depois de a assinatura já estar em curso.
 * Conferir os dígitos antes evita gravar uma intenção de assinatura que vai
 * falhar sete dias depois, quando ninguém está olhando.
 */

/** Documento aceito pelo Asaas: pessoa física ou jurídica. */
export type TipoDocumento = 'CPF' | 'CNPJ';

/**
 * Lançado quando falta o documento ou os dígitos verificadores não fecham.
 * É erro do usuário (vira 400), não de programação.
 */
export class DocumentoInvalidoError extends Error {
  constructor(mensagem = 'Informe um CPF ou CNPJ válido para assinar.') {
    super(mensagem);
    this.name = 'DocumentoInvalidoError';
  }
}

/** Descarta pontos, barras, traços e espaços — a pessoa digita como quiser. */
export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

function digitoVerificador(digitos: string, pesos: readonly number[]): number {
  const soma = pesos.reduce((acc, peso, i) => acc + Number(digitos[i]) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

const PESOS_CNPJ_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const PESOS_CNPJ_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const PESOS_CPF_1 = [10, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const PESOS_CPF_2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2] as const;

/** Sequências como 111.111.111-11 fecham na conta, mas não existem. */
function todosIguais(digitos: string): boolean {
  return /^(\d)\1+$/.test(digitos);
}

function cpfValido(digitos: string): boolean {
  if (digitos.length !== 11 || todosIguais(digitos)) return false;
  return (
    digitoVerificador(digitos, PESOS_CPF_1) === Number(digitos[9]) &&
    digitoVerificador(digitos, PESOS_CPF_2) === Number(digitos[10])
  );
}

function cnpjValido(digitos: string): boolean {
  if (digitos.length !== 14 || todosIguais(digitos)) return false;
  return (
    digitoVerificador(digitos, PESOS_CNPJ_1) === Number(digitos[12]) &&
    digitoVerificador(digitos, PESOS_CNPJ_2) === Number(digitos[13])
  );
}

/** `'CPF' | 'CNPJ'` quando os dígitos verificadores fecham; `null` caso contrário. */
export function tipoDocumento(valor: string | null | undefined): TipoDocumento | null {
  if (!valor) return null;
  const digitos = somenteDigitos(valor);
  if (cpfValido(digitos)) return 'CPF';
  if (cnpjValido(digitos)) return 'CNPJ';
  return null;
}

export function documentoValido(valor: string | null | undefined): boolean {
  return tipoDocumento(valor) !== null;
}

/**
 * Forma canônica para persistir e mandar ao Asaas: só dígitos, e só quando o
 * documento é válido. `null` sinaliza "não dá para cobrar com isto" — quem
 * chama decide se pede de novo ou recusa.
 */
export function normalizarDocumento(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const digitos = somenteDigitos(valor);
  return documentoValido(digitos) ? digitos : null;
}

/** Igual a `normalizarDocumento`, mas falha alto em vez de devolver `null`. */
export function exigirDocumento(valor: string | null | undefined): string {
  const digitos = normalizarDocumento(valor);
  if (!digitos) throw new DocumentoInvalidoError();
  return digitos;
}

/** `12345678909` → `123.456.789-09`; `11222333000181` → `11.222.333/0001-81`. */
export function formatarDocumento(valor: string): string {
  const d = somenteDigitos(valor);
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  return d;
}

/**
 * Versão para tela, log e suporte: mostra o suficiente para a pessoa reconhecer
 * o próprio documento e esconde o suficiente para o número não circular inteiro
 * fora do banco. O documento cru só sai daqui em uma direção — o Asaas.
 */
export function mascararDocumento(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const d = somenteDigitos(valor);
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14) return `**.***.${d.slice(5, 8)}/${d.slice(8, 12)}-**`;
  return null;
}
