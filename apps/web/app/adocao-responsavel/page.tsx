import type { Metadata } from 'next';
import Link from 'next/link';
import { SectionTabs } from '../../components/section-tabs';

export const metadata: Metadata = {
  title: 'Adoção responsável',
  description:
    'Adotar um animal de rua em Belém é um compromisso. No Égua, adota! a adoção é doação: o animal não é vendido.',
};

const steps = [
  {
    title: 'Conheça o animal',
    body: 'Veja a espécie, o porte, a saúde e o temperamento antes de decidir. Pergunte quem está cuidando dele agora.',
  },
  {
    title: 'Veja se cabe na sua rotina',
    body: 'Tempo, espaço, outros animais e o custo de ração, vacina e veterinário precisam caber no seu dia a dia.',
  },
  {
    title: 'Combine o encontro em Belém',
    body: 'Fale com quem publicou o resgate e marque um lugar para conhecer o animal. O telefone só aparece depois que você diz que vai ajudar.',
  },
  {
    title: 'Leve para casa com compromisso',
    body: 'Adotar é ficar. Alimentação, vacina, castração e cuidado veterinário passam a ser seus.',
  },
  {
    title: 'Se não puder ficar para sempre',
    body: 'Ofereça lar temporário em vez de adotar no impulso. Assim o animal não volta para a rua.',
  },
];

export default function ResponsibleAdoptionPage() {
  return (
    <main className="mx-auto w-full max-w-[480px] pt-3 pb-8">
      <SectionTabs />
      <article className="mx-4 rounded-3xl bg-white p-5 shadow-[0_2px_12px_rgba(80,30,60,0.06)]">
        <p className="text-xs font-semibold tracking-wide text-[#8e3a68] uppercase">Belém</p>
        <h1 className="mt-2 font-serif text-[28px] leading-tight font-bold text-[#4c2340]">
          Adoção responsável
        </h1>
        <p className="mt-3 text-[15px] leading-6 text-[#5e4556]">
          Adotar é um compromisso. No Égua, adota! o animal não tem preço: a adoção é doação, nunca
          venda.
        </p>
        <ol className="mt-5 flex flex-col gap-4">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#f3e0ea] text-sm font-bold text-[#6b2454]">
                {index + 1}
              </span>
              <span>
                <span className="block text-sm font-semibold text-[#2c1826]">{step.title}</span>
                <span className="mt-1 block text-sm leading-5 text-[#5e4556]">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-5 rounded-2xl bg-[#f6eef2] p-4 text-sm leading-5 text-[#5e4556]">
          Não pague pelo animal e não peça dinheiro para entregá-lo. Se um post estiver vendendo,
          use Denunciar. Se a adaptação em casa apertar, peça ajuda na rede em vez de abandonar.
        </div>
        <Link
          href="/?type=adoption"
          className="mt-5 flex min-h-11 items-center justify-center rounded-full bg-[#6b2454] px-4 text-sm font-semibold text-white"
        >
          Ver animais para adoção
        </Link>
      </article>
    </main>
  );
}
