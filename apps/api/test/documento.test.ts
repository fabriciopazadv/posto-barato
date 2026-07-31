import { describe, expect, it } from 'vitest';
import {
  DocumentoInvalidoError,
  documentoValido,
  exigirDocumento,
  formatarDocumento,
  mascararDocumento,
  normalizarDocumento,
  somenteDigitos,
  tipoDocumento,
} from '@posto-barato/domain';

// Documentos com dígitos verificadores corretos, gerados para teste — não
// pertencem a ninguém.
const CPF_VALIDO = '52998224725';
const CNPJ_VALIDO = '11222333000181';

describe('tipoDocumento', () => {
  it('reconhece CPF e CNPJ pelos dígitos verificadores', () => {
    expect(tipoDocumento(CPF_VALIDO)).toBe('CPF');
    expect(tipoDocumento(CNPJ_VALIDO)).toBe('CNPJ');
  });

  it('aceita o documento pontuado, como a pessoa digita', () => {
    expect(tipoDocumento('529.982.247-25')).toBe('CPF');
    expect(tipoDocumento('11.222.333/0001-81')).toBe('CNPJ');
  });

  it.each([
    ['vazio', ''],
    ['nulo', null],
    ['curto demais', '5299822472'],
    ['longo demais', '529982247251'],
    ['só letras', 'abcdefghijk'],
  ])('recusa documento %s', (_caso, valor) => {
    expect(tipoDocumento(valor)).toBeNull();
  });

  // O motivo de conferir dígito verificador em vez de só contar 11 ou 14
  // caracteres: o Asaas recusa o documento errado bem depois, na virada do
  // teste, quando ninguém está olhando a tela.
  it('recusa documento com dígito verificador errado', () => {
    expect(tipoDocumento('52998224726')).toBeNull();
    expect(tipoDocumento('11222333000182')).toBeNull();
  });

  it('recusa sequências de dígitos iguais, que fecham na conta mas não existem', () => {
    expect(tipoDocumento('11111111111')).toBeNull();
    expect(tipoDocumento('00000000000000')).toBeNull();
  });
});

describe('normalizarDocumento', () => {
  it('devolve só os dígitos quando o documento é válido', () => {
    expect(normalizarDocumento('529.982.247-25')).toBe(CPF_VALIDO);
    expect(normalizarDocumento(' 11.222.333/0001-81 ')).toBe(CNPJ_VALIDO);
  });

  it('devolve null quando não dá para cobrar com o que veio', () => {
    expect(normalizarDocumento('52998224726')).toBeNull();
    expect(normalizarDocumento(undefined)).toBeNull();
  });
});

describe('exigirDocumento', () => {
  it('deixa passar o documento válido', () => {
    expect(exigirDocumento('529.982.247-25')).toBe(CPF_VALIDO);
  });

  it.each([['ausente', undefined], ['inválido', '11111111111']])(
    'lança DocumentoInvalidoError com documento %s',
    (_caso, valor) => {
      expect(() => exigirDocumento(valor)).toThrow(DocumentoInvalidoError);
    },
  );
});

describe('formatação', () => {
  it('formata para leitura', () => {
    expect(formatarDocumento(CPF_VALIDO)).toBe('529.982.247-25');
    expect(formatarDocumento(CNPJ_VALIDO)).toBe('11.222.333/0001-81');
  });

  // A máscara é o que sai do servidor: reconhecível pelo dono, incompleta para
  // qualquer outra pessoa que veja a tela ou o log.
  it('mascara o suficiente para o documento não circular inteiro', () => {
    expect(mascararDocumento(CPF_VALIDO)).toBe('***.982.247-**');
    expect(mascararDocumento(CNPJ_VALIDO)).toBe('**.***.333/0001-**');
  });

  it('não inventa máscara para o que não é documento', () => {
    expect(mascararDocumento('123')).toBeNull();
    expect(mascararDocumento(null)).toBeNull();
  });

  it('somenteDigitos descarta a pontuação', () => {
    expect(somenteDigitos('529.982.247-25')).toBe(CPF_VALIDO);
  });
});

describe('documentoValido', () => {
  it('é o mesmo julgamento de tipoDocumento, em booleano', () => {
    expect(documentoValido(CPF_VALIDO)).toBe(true);
    expect(documentoValido(CNPJ_VALIDO)).toBe(true);
    expect(documentoValido('')).toBe(false);
    expect(documentoValido(null)).toBe(false);
  });
});
