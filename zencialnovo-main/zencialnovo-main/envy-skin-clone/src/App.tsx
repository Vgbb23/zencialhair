/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, ChangeEvent } from "react";
import { 
  ShoppingBag, 
  Menu, 
  Search,
  Star, 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp, 
  ChevronLeft,
  ChevronRight,
  Truck, 
  ShieldCheck, 
  ArrowRight,
  Droplets,
  Sparkles,
  Zap,
  Moon,
  Sun,
  Flame,
  Instagram,
  Facebook,
  Mail,
  CreditCard,
  Copy,
  Check,
  QrCode,
  MapPin,
  User,
  Phone,
  FileText,
  Clock
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { extractPixFromFruitfyPayload, pickOrderUuidForApi } from "./pixExtract";
import { parseResponseJson } from "./parseResponseJson";
import { mergeUrlParamsFromLocation, toFruitfyUtmPayload } from "./urlParams";
import {
  KIT_CATALOG,
  formatBRL,
  installment12Label,
  listPriceBRLFromKit,
} from "../../api/lib/kitPrices";
import orderBumpRollOnImg from "./assets/order-bump-rollon.png";
import orderBumpHairStickImg from "./assets/order-bump-hair-stick.png";

const onlyDigits = (value: string) => value.replace(/\D/g, "");
const centsFromBRL = (value: number) => Math.round(value * 100);

const formatCep = (digits: string) => {
  const d = digits.slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
};

const formatCpf = (digits: string) => {
  const d = digits.slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

/** Valida CPF brasileiro (11 dígitos + dígitos verificadores). */
const isValidCpf = (digits: string): boolean => {
  const d = onlyDigits(digits);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]!, 10) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  if (rest !== parseInt(d[9]!, 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]!, 10) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  return rest === parseInt(d[10]!, 10);
};

const formatPhoneBr = (digits: string) => {
  const d = digits.slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length === 0) return `(${ddd}) `;
  if (d.length <= 6) return `(${ddd}) ${rest}`;
  if (d.length <= 10) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
};

const inputMaskedClass =
  "w-full px-4 py-3 rounded-xl border border-[#F2E6EB] bg-[#FFFAFB] focus:outline-none focus:border-[#4A8FA8] focus:ring-2 focus:ring-[#4A8FA8]/15 transition-all text-sm tabular-nums tracking-wide text-[#523741] placeholder:text-[#C0A4B0]";

const inputMaskedErrorClass =
  "w-full px-4 py-3 rounded-xl border border-red-400 bg-[#FFFAFB] focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200 transition-all text-sm tabular-nums tracking-wide text-[#523741] placeholder:text-[#C0A4B0]";

interface OrderBump {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
}

const ORDER_BUMPS: OrderBump[] = [
  {
    id: "bump-envy-hair-stick",
    name: "Envy Hair Stick Anti-Frizz",
    description: "Acabe com o frizz na hora: alinha os fios rebeldes, segura o penteado por horas e entrega acabamento de salão em segundos.",
    price: 19.9,
    image: orderBumpHairStickImg,
  },
  {
    id: "bump-roll-on-olheiras",
    name: "Sérum Roll-on Pontas & Contorno",
    description: "Selagem instantânea nas pontas sensíveis: reduz aspereza, disfarça pontas duplas e devolve acabamento alinhado sem pesar na raiz.",
    price: 26.9,
    image: orderBumpRollOnImg,
  },
];

// --- Checkout Components ---

const CheckoutHeader = () => (
  <header className="bg-white py-4 border-b border-[#F2E6EB] sticky top-0 z-50">
    <div className="max-w-5xl mx-auto px-4 flex items-center justify-between">
      <div className="h-6">
        <img 
          src="https://i.ibb.co/Kcb9fST2/image.png" 
          alt="Envy Hair Logo" 
          className="h-full w-auto object-contain"
          referrerPolicy="no-referrer"
        />
      </div>
      <div className="flex items-center gap-2 text-[#523741] font-bold text-sm uppercase tracking-wider">
        <ShieldCheck size={18} className="text-[#4A8FA8]" />
        Checkout Seguro
      </div>
    </div>
  </header>
);

const Checkout = ({ kit, onBack, onFinish }: { kit: any, onBack: () => void, onFinish: (data: any) => Promise<void> }) => {
  const [step, setStep] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [shipping, setShipping] = useState<'free' | 'sedex'>('free');
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const [address, setAddress] = useState({
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: ''
  });
  const [customer, setCustomer] = useState({
    name: '',
    email: '',
    cpf: '',
    phone: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedOrderBumps, setSelectedOrderBumps] = useState<string[]>([]);
  const orderBumps: OrderBump[] = [
    ...ORDER_BUMPS,
    {
      id: "bump-produto-principal-extra",
      name: `${kit.name} Extra com Desconto`,
      description: "Não interrompa o ciclo ativo: garanta uma unidade extra agora e mantenha a rotina no couro cabeludo para potencializar crescimento, densidade e menos queda.",
      price: 27.9,
      image: kit.image,
    },
  ];

  const handleCepChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const digits = onlyDigits(e.target.value).slice(0, 8);
    const formatted = formatCep(digits);
    setAddress((prev) => ({ ...prev, cep: formatted }));

    if (digits.length < 8) {
      setCepError(null);
      return;
    }

    setCepLoading(true);
    setCepError(null);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await response.json();
      if (data.erro) {
        setCepError("CEP não encontrado. Verifique os números.");
        setAddress((prev) => ({
          ...prev,
          cep: formatted,
          street: "",
          neighborhood: "",
          city: "",
          state: "",
        }));
      } else {
        setCepError(null);
        setAddress((prev) => ({
          ...prev,
          cep: formatted,
          street: data.logradouro ?? "",
          neighborhood: data.bairro ?? "",
          city: data.localidade ?? "",
          state: data.uf ?? "",
        }));
      }
    } catch (error) {
      console.error("Erro ao buscar CEP", error);
      setCepError("Não foi possível validar o CEP. Tente de novo.");
    } finally {
      setCepLoading(false);
    }
  };

  const cepDigits = onlyDigits(address.cep);
  const cpfDigits = onlyDigits(customer.cpf);
  const cpfInvalid = cpfDigits.length === 11 && !isValidCpf(cpfDigits);

  const subtotal = kit.price * quantity;
  const shippingPrice = shipping === 'sedex' ? 19.45 : 0;
  const orderBumpsTotal = orderBumps
    .filter((bump) => selectedOrderBumps.includes(bump.id))
    .reduce((sum, bump) => sum + bump.price, 0);
  const total = subtotal + shippingPrice + orderBumpsTotal;
  
  const toggleOrderBump = (id: string) => {
    setSelectedOrderBumps((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };
  
  const handleSubmitOrder = async () => {
    setSubmitError(null);
    const requiredFieldsFilled =
      customer.name.trim() &&
      customer.email.trim() &&
      customer.cpf.trim() &&
      customer.phone.trim();

    if (!requiredFieldsFilled) {
      setSubmitError("Preencha nome, e-mail, CPF e telefone para continuar.");
      return;
    }

    if (cpfDigits.length !== 11) {
      setSubmitError("Informe o CPF completo (11 dígitos).");
      return;
    }
    if (!isValidCpf(customer.cpf)) {
      setSubmitError("O CPF informado é inválido.");
      return;
    }

    if (cepDigits.length !== 8) {
      setSubmitError("Informe o CEP completo (8 dígitos).");
      return;
    }
    if (cepError) {
      setSubmitError("Corrija o CEP antes de finalizar o pedido.");
      return;
    }

    setSubmitting(true);
    try {
      await onFinish({ total, customer, address, shipping, quantity, orderBumpsTotal });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Não foi possível gerar o PIX.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFAFB] pb-20">
      <CheckoutHeader />
      
      <main className="max-w-5xl mx-auto px-4 py-8">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-[#8A6B7A] text-sm mb-8 hover:text-[#4A8FA8] transition-colors"
        >
          <ChevronLeft size={16} />
          Voltar para a loja
        </button>

        <div className="grid lg:grid-cols-[1fr_380px] gap-8 items-start">
          {/* Form Section */}
          <div className="space-y-6">
            {/* Dados Pessoais */}
            <section className="bg-white p-6 sm:p-8 rounded-3xl border border-[#F2E6EB] shadow-sm space-y-6">
              <div className="flex items-center gap-3 border-b border-[#F2E6EB] pb-4">
                <div className="w-10 h-10 bg-[#F2E6EB] rounded-full flex items-center justify-center text-[#4A8FA8]">
                  <User size={20} />
                </div>
                <h2 className="text-lg font-bold text-[#523741]">Dados Pessoais</h2>
              </div>
              
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#523741] uppercase tracking-wider">Nome Completo</label>
                  <input 
                    type="text" 
                    placeholder="Seu nome completo"
                    className="w-full px-4 py-3 rounded-xl border border-[#F2E6EB] bg-[#FFFAFB] focus:outline-none focus:border-[#4A8FA8] transition-colors text-sm"
                    value={customer.name}
                    onChange={e => setCustomer({...customer, name: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#523741] uppercase tracking-wider">E-mail</label>
                  <input 
                    type="email" 
                    placeholder="seu@email.com"
                    className="w-full px-4 py-3 rounded-xl border border-[#F2E6EB] bg-[#FFFAFB] focus:outline-none focus:border-[#4A8FA8] transition-colors text-sm"
                    value={customer.email}
                    onChange={e => setCustomer({...customer, email: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#523741] uppercase tracking-wider">CPF</label>
                  <input 
                    type="text" 
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="000.000.000-00"
                    maxLength={14}
                    className={cpfInvalid ? inputMaskedErrorClass : inputMaskedClass}
                    value={customer.cpf}
                    onChange={(e) =>
                      setCustomer({
                        ...customer,
                        cpf: formatCpf(onlyDigits(e.target.value)),
                      })
                    }
                  />
                  {cpfInvalid && (
                    <p className="text-xs text-red-600 font-medium">CPF inválido. Confira os números.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#523741] uppercase tracking-wider">Celular / WhatsApp</label>
                  <input 
                    type="tel" 
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="(00) 00000-0000"
                    maxLength={15}
                    className={inputMaskedClass}
                    value={customer.phone}
                    onChange={(e) =>
                      setCustomer({
                        ...customer,
                        phone: formatPhoneBr(onlyDigits(e.target.value)),
                      })
                    }
                  />
                </div>
              </div>
            </section>

            {/* Entrega */}
            <section className="bg-white p-6 sm:p-8 rounded-3xl border border-[#F2E6EB] shadow-sm space-y-6">
              <div className="flex items-center gap-3 border-b border-[#F2E6EB] pb-4">
                <div className="w-10 h-10 bg-[#F2E6EB] rounded-full flex items-center justify-center text-[#4A8FA8]">
                  <MapPin size={20} />
                </div>
                <h2 className="text-lg font-bold text-[#523741]">Dados de Entrega</h2>
              </div>
              
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#523741] uppercase tracking-wider">CEP</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      inputMode="numeric"
                      autoComplete="postal-code"
                      placeholder="00000-000"
                      maxLength={9}
                      className={cepError ? inputMaskedErrorClass : inputMaskedClass}
                      value={address.cep}
                      onChange={handleCepChange}
                    />
                    {cepLoading && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[#4A8FA8] border-t-transparent rounded-full animate-spin"></div>}
                  </div>
                  {cepError && (
                    <p className="text-xs text-red-600 font-medium">{cepError}</p>
                  )}
                </div>
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-[#523741] uppercase tracking-wider">Endereço</label>
                  <input 
                    type="text" 
                    placeholder="Rua, Avenida..."
                    className="w-full px-4 py-3 rounded-xl border border-[#F2E6EB] bg-[#FFFAFB] focus:outline-none focus:border-[#4A8FA8] transition-colors text-sm"
                    value={address.street}
                    onChange={e => setAddress({...address, street: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#523741] uppercase tracking-wider">Número</label>
                  <input 
                    type="text" 
                    placeholder="123"
                    className="w-full px-4 py-3 rounded-xl border border-[#F2E6EB] bg-[#FFFAFB] focus:outline-none focus:border-[#4A8FA8] transition-colors text-sm"
                    value={address.number}
                    onChange={e => setAddress({...address, number: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#523741] uppercase tracking-wider">Complemento</label>
                  <input 
                    type="text" 
                    placeholder="Apto, Bloco..."
                    className="w-full px-4 py-3 rounded-xl border border-[#F2E6EB] bg-[#FFFAFB] focus:outline-none focus:border-[#4A8FA8] transition-colors text-sm"
                    value={address.complement}
                    onChange={e => setAddress({...address, complement: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#523741] uppercase tracking-wider">Bairro</label>
                  <input 
                    type="text" 
                    placeholder="Bairro"
                    className="w-full px-4 py-3 rounded-xl border border-[#F2E6EB] bg-[#FFFAFB] focus:outline-none focus:border-[#4A8FA8] transition-colors text-sm"
                    value={address.neighborhood}
                    onChange={e => setAddress({...address, neighborhood: e.target.value})}
                  />
                </div>
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-[#523741] uppercase tracking-wider">Cidade</label>
                  <input 
                    type="text" 
                    placeholder="Cidade"
                    className="w-full px-4 py-3 rounded-xl border border-[#F2E6EB] bg-[#FFFAFB] focus:outline-none focus:border-[#4A8FA8] transition-colors text-sm"
                    value={address.city}
                    onChange={e => setAddress({...address, city: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#523741] uppercase tracking-wider">Estado</label>
                  <input 
                    type="text" 
                    placeholder="UF"
                    className="w-full px-4 py-3 rounded-xl border border-[#F2E6EB] bg-[#FFFAFB] focus:outline-none focus:border-[#4A8FA8] transition-colors text-sm"
                    value={address.state}
                    onChange={e => setAddress({...address, state: e.target.value})}
                  />
                </div>
              </div>

              {cepDigits.length === 8 && !cepLoading && !cepError && (
                <div className="space-y-4 pt-4 border-t border-[#F2E6EB]">
                  <label className="text-xs font-bold text-[#523741] uppercase tracking-wider">Escolha o Frete</label>
                  <div className="grid gap-3">
                    <button 
                      onClick={() => setShipping('free')}
                      className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all text-left ${shipping === 'free' ? 'border-[#4A8FA8] bg-[#F2E6EB]' : 'border-[#F2E6EB] hover:border-[#E8D5DE]'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${shipping === 'free' ? 'border-[#4A8FA8]' : 'border-[#8A6B7A]'}`}>
                          {shipping === 'free' && <div className="w-2.5 h-2.5 bg-[#4A8FA8] rounded-full" />}
                        </div>
                        <div>
                          <p className="font-bold text-[#523741] text-sm">Frete Grátis</p>
                          <p className="text-xs text-[#8A6B7A]">7 a 10 dias úteis</p>
                        </div>
                      </div>
                      <span className="font-bold text-[#4A8FA8] text-sm">Grátis</span>
                    </button>
                    <button 
                      onClick={() => setShipping('sedex')}
                      className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all text-left ${shipping === 'sedex' ? 'border-[#4A8FA8] bg-[#F2E6EB]' : 'border-[#F2E6EB] hover:border-[#E8D5DE]'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${shipping === 'sedex' ? 'border-[#4A8FA8]' : 'border-[#8A6B7A]'}`}>
                          {shipping === 'sedex' && <div className="w-2.5 h-2.5 bg-[#4A8FA8] rounded-full" />}
                        </div>
                        <div>
                          <p className="font-bold text-[#523741] text-sm">SEDEX Express</p>
                          <p className="text-xs text-[#8A6B7A]">2 a 3 dias úteis</p>
                        </div>
                      </div>
                      <span className="font-bold text-[#523741] text-sm">R$ 19,45</span>
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Pagamento */}
            <section className="bg-white p-6 sm:p-8 rounded-3xl border border-[#F2E6EB] shadow-sm space-y-6">
              <div className="flex items-center gap-3 border-b border-[#F2E6EB] pb-4">
                <div className="w-10 h-10 bg-[#F2E6EB] rounded-full flex items-center justify-center text-[#4A8FA8]">
                  <Zap size={20} />
                </div>
                <h2 className="text-lg font-bold text-[#523741]">Pagamento</h2>
              </div>
              
              <div className="p-4 rounded-2xl border-2 border-[#4A8FA8] bg-[#F2E6EB] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-[#4A8FA8] shadow-sm">
                    <Zap size={20} fill="currentColor" />
                  </div>
                  <div>
                    <p className="font-bold text-[#523741] text-sm">PIX</p>
                    <p className="text-xs text-[#8A6B7A]">Aprovação imediata</p>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-[#8A6B7A] text-center italic">
                O código PIX será gerado após a finalização do pedido.
              </p>
              <div className="space-y-3">
                {orderBumps.map((bump) => {
                  const isSelected = selectedOrderBumps.includes(bump.id);
                  return (
                    <button
                      key={bump.id}
                      type="button"
                      onClick={() => toggleOrderBump(bump.id)}
                      className={`w-full text-left rounded-2xl border p-3 transition-all ${
                        isSelected
                          ? "border-[#4A8FA8] bg-[#F2E6EB]"
                          : "border-[#F2E6EB] bg-white hover:border-[#E8D5DE]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <img
                            src={bump.image}
                            alt={bump.name}
                            className="w-14 h-14 rounded-xl object-cover border border-[#F2E6EB]"
                          />
                          <div>
                            <p className="text-sm font-bold text-[#523741]">{bump.name}</p>
                            <p className="text-xs text-[#8A6B7A] mt-1">{bump.description}</p>
                          </div>
                        </div>
                        <span className="text-sm font-black text-[#4A8FA8] whitespace-nowrap">
                          + R$ {bump.price.toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Summary Section */}
          <div className="lg:sticky lg:top-28 space-y-6">
            <section className="bg-white p-6 rounded-3xl border border-[#F2E6EB] shadow-lg space-y-6">
              <h2 className="text-lg font-bold text-[#523741] border-b border-[#F2E6EB] pb-4">Resumo do Pedido</h2>
              
              <div className="flex gap-4">
                <div className="w-20 h-20 bg-[#F2E6EB] rounded-xl overflow-hidden flex-shrink-0 border border-[#F2E6EB]">
                  <img src={kit.image} alt={kit.name} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 space-y-1">
                  <h3 className="font-bold text-[#523741] text-sm leading-tight">{kit.name} Envy Hair</h3>
                  <p className="text-xs text-[#8A6B7A]">Protocolo capilar premium</p>
                  
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center border border-[#F2E6EB] rounded-lg overflow-hidden">
                      <button 
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        className="px-2 py-1 hover:bg-[#F2E6EB] text-[#4A8FA8] transition-colors"
                      >
                        <ChevronDown size={14} />
                      </button>
                      <span className="px-3 py-1 text-xs font-bold text-[#523741] border-x border-[#F2E6EB] min-w-[32px] text-center">
                        {quantity}
                      </span>
                      <button 
                        onClick={() => setQuantity(quantity + 1)}
                        className="px-2 py-1 hover:bg-[#F2E6EB] text-[#4A8FA8] transition-colors"
                      >
                        <ChevronUp size={14} />
                      </button>
                    </div>
                    <p className="font-bold text-[#523741] text-sm">R$ {subtotal.toFixed(2).replace('.', ',')}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-[#F2E6EB]">
                <div className="flex justify-between text-sm">
                  <span className="text-[#8A6B7A]">Subtotal</span>
                  <span className="text-[#523741] font-medium">R$ {subtotal.toFixed(2).replace('.', ',')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#8A6B7A]">Frete</span>
                  <span className="text-[#4A8FA8] font-bold">{shippingPrice > 0 ? `R$ ${shippingPrice.toFixed(2).replace('.', ',')}` : 'GRÁTIS'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#8A6B7A]">Adicionais</span>
                  <span className="text-[#523741] font-medium">R$ {orderBumpsTotal.toFixed(2).replace('.', ',')}</span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-[#F2E6EB]">
                  <span className="font-bold text-[#523741]">Total</span>
                  <div className="text-right">
                    <p className="text-2xl font-black text-[#523741]">R$ {total.toFixed(2).replace('.', ',')}</p>
                    <p className="text-[10px] text-[#8A6B7A]">ou 12x de R$ {(total / 12).toFixed(2).replace('.', ',')}</p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleSubmitOrder}
                disabled={submitting}
                className="w-full py-4 bg-[#4A8FA8] text-white rounded-full font-bold hover:bg-[#3d7a8f] transition-all shadow-lg shadow-teal-100 flex items-center justify-center gap-2 group"
              >
                {submitting ? "GERANDO PIX..." : "FINALIZAR PEDIDO"}
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
              {submitError && (
                <p className="text-xs text-red-500 text-center">{submitError}</p>
              )}

              <div className="flex items-center justify-center gap-2 pt-4">
                <div className="flex items-center gap-1 text-[10px] font-bold text-[#523741]">
                  <ShieldCheck size={12} className="text-[#4A8FA8]" />
                  COMPRA SEGURA
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};

const POST_PIX_PAID_REDIRECT_DEFAULT = "https://rastreiogummy.netlify.app/";
const POST_PIX_POLL_MS = 200;

const PixSuccess = ({ orderData, onReset }: { orderData: any, onReset: () => void }) => {
  const [copied, setCopied] = useState(false);
  const pixCode = orderData.pixCode;
  const qrCodeImage = orderData.qrCodeImage;
  const orderUuid =
    (typeof orderData.orderId === "string" && orderData.orderId) ||
    pickOrderUuidForApi(orderData.gatewayPayload);

  useEffect(() => {
    const redirectUrl =
      (import.meta.env.VITE_PIX_PAID_REDIRECT_URL as string | undefined)?.trim() ||
      POST_PIX_PAID_REDIRECT_DEFAULT;
    if (!orderUuid) return;

    let cancelled = false;
    let inFlight = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const started = Date.now();
    const maxMs = 2 * 60 * 60 * 1000;
    const terminalFail = new Set([
      "canceled",
      "cancelled",
      "refused",
      "failed",
      "refunded",
      "chargeback",
    ]);

    const stop = () => {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const tick = async () => {
      if (cancelled || inFlight) return;
      if (Date.now() - started > maxMs) {
        stop();
        return;
      }
      inFlight = true;
      try {
        const r = await fetch(`/api/order/${encodeURIComponent(orderUuid)}`);
        const j = (await parseResponseJson(r)) as {
          data?: { status?: string };
        };
        if (cancelled) return;
        const status = typeof j?.data?.status === "string" ? j.data.status : "";
        if (status === "paid") {
          stop();
          window.location.replace(redirectUrl);
          return;
        }
        if (terminalFail.has(status)) stop();
      } catch {
        /* próximo ciclo */
      } finally {
        inFlight = false;
      }
    };

    intervalId = setInterval(tick, POST_PIX_POLL_MS);
    void tick();

    return () => {
      cancelled = true;
      stop();
    };
  }, [orderUuid]);

  const handleCopy = () => {
    navigator.clipboard.writeText(pixCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#FFFAFB] pb-20">
      <CheckoutHeader />
      
      <main className="max-w-2xl mx-auto px-4 py-12 text-center space-y-8">
        <div className="space-y-4">
          <div className="w-20 h-20 bg-[#F2E6EB] rounded-full flex items-center justify-center text-[#4A8FA8] mx-auto mb-6">
            <CheckCircle2 size={40} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#523741]">Pedido Realizado com Sucesso!</h1>
          <p className="text-[#8A6B7A] max-w-md mx-auto">
            Falta pouco! Realize o pagamento via PIX para que possamos enviar seu Envy Hair o quanto antes.
          </p>
          {orderUuid ? (
            <p className="text-xs text-[#4A8FA8] font-medium max-w-md mx-auto">
              Aguardando confirmação do pagamento… você será redirecionado assim que o PIX for aprovado.
            </p>
          ) : (
            <p className="text-xs text-amber-700/90 max-w-md mx-auto">
              Não foi possível identificar o pedido para acompanhamento automático. Após pagar, guarde o comprovante.
            </p>
          )}
        </div>

        <div className="bg-white p-8 rounded-3xl border border-[#F2E6EB] shadow-xl space-y-8">
          <div className="space-y-2">
            <p className="text-xs font-bold text-[#8A6B7A] uppercase tracking-widest">Valor a pagar</p>
            <p className="text-4xl font-black text-[#523741]">R$ {orderData.total.toFixed(2).replace('.', ',')}</p>
          </div>

          <div className="bg-[#F2E6EB] p-6 rounded-2xl inline-block border-2 border-[#E8D5DE]">
            {qrCodeImage ? (
              <img
                src={qrCodeImage.startsWith("data:") ? qrCodeImage : `data:image/png;base64,${qrCodeImage}`}
                alt="QR Code PIX"
                className="w-[180px] h-[180px] object-contain"
              />
            ) : (
              <QrCode size={180} className="text-[#523741]" />
            )}
          </div>

          <div className="space-y-4">
            <p className="text-sm font-bold text-[#523741]">Código PIX Copia e Cola</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input 
                type="text" 
                readOnly 
                value={pixCode}
                className="flex-1 bg-[#FFFAFB] border border-[#F2E6EB] rounded-xl px-4 py-3 text-xs text-[#8A6B7A] truncate"
              />
              <button 
                onClick={handleCopy}
                className="w-full sm:w-auto bg-[#4A8FA8] text-white px-6 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#3d7a8f] transition-all"
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 text-left max-w-md mx-auto">
          <h3 className="font-bold text-[#523741] flex items-center gap-2">
            <Clock size={18} className="text-[#4A8FA8]" />
            Como pagar?
          </h3>
          <ol className="space-y-3 text-sm text-[#8A6B7A]">
            <li className="flex gap-3">
              <span className="w-5 h-5 bg-[#F2E6EB] rounded-full flex items-center justify-center text-[10px] font-bold text-[#4A8FA8] flex-shrink-0">1</span>
              Abra o app do seu banco e escolha a opção PIX.
            </li>
            <li className="flex gap-3">
              <span className="w-5 h-5 bg-[#F2E6EB] rounded-full flex items-center justify-center text-[10px] font-bold text-[#4A8FA8] flex-shrink-0">2</span>
              Escaneie o QR Code ou cole o código acima.
            </li>
            <li className="flex gap-3">
              <span className="w-5 h-5 bg-[#F2E6EB] rounded-full flex items-center justify-center text-[10px] font-bold text-[#4A8FA8] flex-shrink-0">3</span>
              Confirme os dados e finalize o pagamento.
            </li>
          </ol>
        </div>

        <button 
          onClick={onReset}
          className="text-[#8A6B7A] text-sm font-medium hover:text-[#4A8FA8] transition-colors pt-8"
        >
          Voltar para a página inicial
        </button>
      </main>
    </div>
  );
};


const AnnouncementBar = () => (
  <div className="bg-[#F2E6EB] text-[#4A8FA8] text-[10px] py-2 px-4 text-center font-medium tracking-wider uppercase border-b border-[#E8D5DE]">
    FRETE GRÁTIS PARA TODO O BRASIL
  </div>
);

const Header = ({ cartCount }: { cartCount: number }) => {
  return (
    <header className="bg-white py-3 sm:py-4 border-b border-[#F2E6EB] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
        <button className="text-[#8A6B7A] p-1">
          <Menu size={24} sm:size={28} strokeWidth={1.5} />
        </button>
        
        <div className="h-8 sm:h-10">
          <img 
            src="https://i.ibb.co/Kcb9fST2/image.png" 
            alt="Envy Hair Logo" 
            className="h-full w-auto object-contain"
            referrerPolicy="no-referrer"
          />
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button className="text-[#8A6B7A] p-1">
            <Search size={20} sm:size={24} strokeWidth={1.5} />
          </button>
          <button className="relative text-[#8A6B7A] p-1">
            <ShoppingBag size={20} sm:size={24} strokeWidth={1.5} />
            {cartCount > 0 && (
              <span className="absolute top-0 right-0 bg-[#4A8FA8] text-white text-[8px] w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full flex items-center justify-center font-bold">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};

const DarkHero = () => (
  <section className="bg-[#523741] text-white py-12 sm:py-16 px-4 sm:px-6 text-center space-y-6 sm:space-y-8">
    <div className="flex items-center justify-center gap-4 sm:gap-8 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest opacity-80 pb-4 border-b border-white/10">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full animate-pulse" />
        Bioestimulação do bulbo
      </div>
      <div className="flex items-center gap-2">
        <Sun size={12} sm:size={14} />
        Seguro para o couro cabeludo
      </div>
    </div>

    <div className="relative w-full max-w-[min(92vw,360px)] sm:max-w-md mx-auto aspect-square rounded-2xl overflow-hidden shadow-2xl">
      <img 
        src="https://i.ibb.co/zHbkMzXd/image.png" 
        alt="Rotina capilar noturna" 
        className="w-full h-full object-cover object-center"
        referrerPolicy="no-referrer"
      />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/grid-me.png')] opacity-20 mix-blend-overlay"></div>
    </div>

    <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
      Reative o ciclo capilar <br />
      a partir da raiz.
    </h2>

    <p className="text-sm leading-relaxed text-[#F2E6EB] text-center max-w-md mx-auto px-2">
      O <strong>Envy Hair</strong> é o <strong>óleo sérum premium</strong> que penetra nas camadas profundas do couro cabeludo 
      para sair da “dormência” folicular. O blend bioativo estimula microcirculação, prolonga a fase de crescimento 
      e devolve densidade, força e brilho com abordagem dermocosmética elegante.
    </p>

    <div className="pt-2 sm:pt-4">
      <button 
        onClick={() => document.getElementById('kits')?.scrollIntoView({ behavior: 'smooth' })}
        className="w-full sm:w-auto bg-[#4A8FA8] text-white px-6 sm:px-10 py-4 sm:py-5 rounded-full font-bold text-xs sm:text-sm shadow-xl hover:bg-[#3d7a8f] active:scale-95 transition-all"
      >
        Quero sentir a raiz mais forte e o cabelo renascendo!
      </button>
    </div>
  </section>
);

const LandingHero = () => (
  <section className="relative min-h-[80vh] sm:min-h-[90vh] flex items-center pt-12 sm:pt-20 pb-20 sm:pb-32 overflow-hidden bg-white">
    {/* Decorative elements */}
    <div className="absolute top-0 right-0 w-1/2 h-full bg-[#F2E6EB] -z-10 rounded-l-[100px] hidden lg:block"></div>
    <div className="absolute top-20 right-20 w-64 h-64 bg-[#4A8FA8]/10 rounded-full blur-3xl -z-10 animate-pulse"></div>
    
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="space-y-8 sm:space-y-12 text-center"
      >
        <div className="space-y-6 sm:space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#F2E6EB] rounded-full text-[10px] sm:text-xs font-bold text-[#4A8FA8] uppercase tracking-widest mx-auto">
            <Sparkles size={14} /> Complexo RootsRevive™
          </div>
          
          <h1 className="text-3xl sm:text-4xl lg:text-6xl font-bold text-[#523741] leading-[1.1] tracking-tight">
            O ciclo capilar <br />
            <span className="text-[#4A8FA8]">acorda na raiz</span> <br className="hidden sm:block" />
            com ciência e luxo.
          </h1>
        </div>

        {/* Image moved below title */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="relative max-w-xl mx-auto px-4 sm:px-0"
        >
          <div className="relative z-10 rounded-[32px] sm:rounded-[40px] overflow-hidden shadow-[0_30px_60px_-15px_rgba(74,143,168,0.32)]">
            <img 
              src="https://i.ibb.co/gZHxc6y0/image.png" 
              alt="Cabelo com brilho e densidade" 
              className="w-full h-auto object-cover max-h-[400px] sm:max-h-[500px]"
              referrerPolicy="no-referrer"
            />
          </div>
        </motion.div>
        
        <div className="space-y-8 sm:space-y-10">
          <p className="text-lg sm:text-xl text-[#8A6B7A] max-w-2xl leading-relaxed mx-auto">
            O <strong>Envy Hair</strong> é o óleo sérum que atua onde o problema nasce: no couro cabeludo. Reativa a microcirculação, 
            fortalece o folículo e prolonga a fase de crescimento — para menos queda, mais volume e fios com corpo e brilho espelhado.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button 
              onClick={() => {
                document.getElementById('kits')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="bg-[#4A8FA8] text-white px-8 sm:px-10 py-5 sm:py-6 rounded-full font-bold text-base sm:text-lg shadow-2xl shadow-teal-200 hover:bg-[#3d7a8f] transition-all transform hover:scale-105 flex items-center justify-center gap-3 group mx-auto sm:mx-0"
            >
              QUERO MEU CRESCIMENTO DE SALÃO EM CASA
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 pt-6 sm:pt-8 border-t border-[#F2E6EB] max-w-lg mx-auto">
            <div className="flex -space-x-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-white overflow-hidden bg-gray-100">
                  <img src={`https://randomuser.me/api/portraits/women/${i + 10}.jpg`} alt="User" referrerPolicy="no-referrer" />
                </div>
              ))}
            </div>
            <div className="space-y-1 text-center sm:text-left">
              <div className="flex justify-center sm:justify-start text-[#4A8FA8]">
                {[...Array(5)].map((_, i) => <Star key={i} size={14} fill="currentColor" stroke="none" />)}
              </div>
              <p className="text-[10px] sm:text-xs text-[#8A6B7A] font-medium">+15.000 mulheres na rotina Envy Hair</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  </section>
);

const Benefits = () => (
  <section id="beneficios" className="py-12 sm:py-20 bg-white">
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-16 space-y-3 sm:space-y-4">
        <h2 className="text-2xl sm:text-4xl font-bold text-[#523741] tracking-tight">
          O que o Envy Hair faz pelos seus fios?
        </h2>
        <p className="text-sm sm:text-base text-[#8A6B7A]">
          Uma sinergia dermocapilar premium que combina óleos nobres e ativos botânicos para atacar queda, densidade, oleosidade e frizz no mesmo ritual.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
        {[
          { icon: <Sparkles />, title: "Estimula o crescimento", desc: "Bioativos que favorecem a fase anágena e o alongamento do fio com raiz nutrida." },
          { icon: <Droplets />, title: "Reduz a queda", desc: "Microcirculação ativa e folículo menos “adormecido” para menos fios no ralo e no travesseiro." },
          { icon: <Zap />, title: "Densidade & força", desc: "Mais corpo na fitagem, menos quebra e sensação de fio fino sem vida." },
          { icon: <CheckCircle2 />, title: "Brilho & controle", desc: "Oleosidade equilibrada, frizz domado e reflexo luminoso digno de selfie sem filtro." },
        ].map((benefit, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="p-6 sm:p-8 rounded-2xl border border-[#F2E6EB] hover:border-[#4A8FA8]/20 hover:shadow-xl transition-all group"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-[#F2E6EB] rounded-xl flex items-center justify-center text-[#4A8FA8] mb-4 sm:mb-6 group-hover:bg-[#4A8FA8] group-hover:text-white transition-colors">
              {benefit.icon}
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-[#523741] mb-2 sm:mb-3">{benefit.title}</h3>
            <p className="text-[#8A6B7A] leading-relaxed text-xs sm:text-sm">{benefit.desc}</p>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

const Technology = () => (
  <section id="tecnologia" className="py-12 sm:py-20 bg-[#523741] text-white overflow-hidden">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 sm:gap-16 items-center">
      <motion.div
        initial={{ opacity: 0, x: -50 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        className="space-y-6 sm:space-y-8 text-center lg:text-left"
      >
        <div className="space-y-3 sm:space-y-4">
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold leading-tight">
            Complexo RootsRevive™ <br />
            <span className="text-[#C9B0BD]">Penetração direcionada ao bulbo piloso.</span>
          </h2>
          <p className="text-[#F2E6EB]/80 text-base sm:text-lg leading-relaxed max-w-xl mx-auto lg:mx-0">
            Enquanto óleos comuns ficam só no comprimento, a arquitetura do Envy Hair foi desenhada para 
            ancorar ativos no couro cabeludo: ali acontece a “comunicação” com o folículo e a leitura do seu ciclo capilar — 
            com linguagem de formulação clínica e sensorial couture.
          </p>
        </div>

        <div className="grid gap-4 sm:gap-6 text-left max-w-md mx-auto lg:mx-0">
          {[
            "Blend bioativo: alecrim, rícino, jojoba, argan, abacate e melaleuca",
            "Estímulo à microcirculação e suporte à fase anágena (crescimento)",
            "Nutrição profunda da raiz com lipídios compatíveis com o fio",
            "Textura sérum-óleo leve, hipoalergênica e sem parabenos"
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 sm:gap-4">
              <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 size={12} sm:size={14} className="text-white" />
              </div>
              <span className="text-sm sm:text-base font-medium text-[#F2E6EB]">{item}</span>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        className="relative px-4 sm:px-0"
      >
        <div className="aspect-square rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl border border-white/10">
          <img 
            src="https://i.ibb.co/CK40SHkM/image.png" 
            alt="Ilustração do complexo capilar" 
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
      </motion.div>
    </div>
  </section>
);

const Ingredients = () => (
  <section id="ingredientes" className="py-12 sm:py-20 bg-[#F2E6EB]/30">
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-16 space-y-3 sm:space-y-4">
        <h2 className="text-2xl sm:text-4xl font-bold text-[#523741] tracking-tight">
          Ativos que falam a língua do folículo
        </h2>
        <p className="text-sm sm:text-base text-[#8A6B7A]">
          Óleos vegetais nobres e extratos botânicos em concentrações pensadas para performance capilar, não para modinha de banheiro.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
        {[
          { name: "Óleo de Alecrim", desc: "Referência aromática e revitalizante associada à sensação de couro cabeludo “vivo” e oxigenado." },
          { name: "Óleo de Rícino", desc: "Rico em ácidos graxos, tradicionalmente celebrado por nutrir a raiz e dar corpo ao fio." },
          { name: "Óleo de Jojoba", desc: "Mimetiza os lipídios naturais, ajuda no equilíbrio da oleosidade sem efeito pesado." },
          { name: "Óleo de Argan", desc: "Assinatura de brilho e maciez: sela cutículas e melhora o deslize do penteado." },
          { name: "Óleo de Abacate", desc: "Aporte de nutrição profunda para fios elásticos, menos quebra ao pentear." },
          { name: "Melaleuca & botânicos", desc: "Completa o blend com frescor sensorial e sensação de couro cabeludo purificado e confortável." },
        ].map((item, i) => (
          <div key={i} className="bg-white p-6 sm:p-8 rounded-2xl border border-[#F2E6EB] hover:shadow-lg transition-all">
            <h4 className="text-base sm:text-lg font-bold text-[#4A8FA8] mb-2">{item.name}</h4>
            <p className="text-xs sm:text-sm text-[#8A6B7A] leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const Kits = ({ onAddToCart }: { onAddToCart: (kit: any) => void }) => (
  <section id="kits" className="py-12 sm:py-20 bg-white">
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      <div className="text-center mb-10 sm:mb-16 space-y-3 sm:space-y-4">
        <h2 className="text-2xl sm:text-4xl font-bold text-[#523741] tracking-tight">
          Escolha seu kit e entre no protocolo Envy Hair
        </h2>
        <p className="text-sm sm:text-base text-[#8A6B7A]">Quanto mais tempo o couro cabeludo “escuta” o sérum-óleo, mais consistente fica o resultado em comprimento e densidade.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 sm:gap-12 lg:gap-8 items-center">
        {KIT_CATALOG.map((kit) => {
          const list = listPriceBRLFromKit(kit.priceBRL);
          const savings = Math.round((list - kit.priceBRL) * 100) / 100;
          const cardClass = kit.popular
            ? "border-2 border-[#4A8FA8] rounded-3xl p-6 sm:p-8 flex flex-col items-center text-center space-y-6 shadow-2xl relative sm:transform sm:scale-105 bg-white z-10"
            : "border border-[#F2E6EB] rounded-3xl p-6 sm:p-8 flex flex-col items-center text-center space-y-6 hover:shadow-xl transition-all";
          const treatmentClass = kit.popular
            ? "text-[10px] font-bold text-[#523741] uppercase tracking-widest"
            : "text-[10px] font-bold text-[#8A6B7A] uppercase tracking-widest";

          return (
            <div key={kit.id} className={cardClass}>
              {kit.popular ? (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#4A8FA8] text-white px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
                  Mais Vendido
                </div>
              ) : null}
              <p className={treatmentClass}>{kit.treatmentLabel}</p>
              <div className="w-40 h-40 sm:w-48 sm:h-48 bg-[#F2E6EB] rounded-2xl overflow-hidden">
                <img src={kit.image} alt={`Kit ${kit.name}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-[#523741]">{kit.name}</h3>
              <div className="space-y-1">
                <p className="text-[#8A6B7A] line-through text-xs sm:text-sm">R$ {formatBRL(list)}</p>
                <p className="text-3xl sm:text-4xl font-bold text-[#523741]">R$ {formatBRL(kit.priceBRL)}</p>
                {kit.id === 2 ? (
                  <p className="text-xs sm:text-sm text-[#4A8FA8] font-bold">Economia de R$ {formatBRL(savings)}</p>
                ) : null}
                {kit.id === 3 ? (
                  <p className="text-xs sm:text-sm text-[#4A8FA8] font-bold">50% de Desconto</p>
                ) : null}
                <p className="text-xs sm:text-sm text-[#8A6B7A]">ou 12x de R$ {installment12Label(kit.priceBRL)}</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onAddToCart({
                    id: kit.id,
                    name: kit.name,
                    price: kit.priceBRL,
                    image: kit.image,
                  })
                }
                className={
                  kit.popular
                    ? "w-full py-4 bg-[#4A8FA8] text-white rounded-full font-bold hover:bg-[#3d7a8f] transition-all shadow-lg shadow-teal-200 text-sm sm:text-base"
                    : "w-full py-4 bg-[#4A8FA8] text-white rounded-full font-bold hover:bg-[#3d7a8f] transition-all shadow-lg shadow-teal-100 text-sm sm:text-base"
                }
              >
                {kit.popular ? "APROVEITAR OFERTA" : "COMPRAR AGORA"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  </section>
);

const FAQ = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="py-12 sm:py-20 bg-[#F2E6EB]/30">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h2 className="text-2xl sm:text-4xl font-bold text-[#523741] text-center mb-10 sm:mb-16 tracking-tight">
          Dúvidas Frequentes
        </h2>
        
        <div className="space-y-3 sm:space-y-4">
          {[
            { q: "Em quanto tempo vejo resultados?", a: "Em média, 7 a 14 dias para brilho, maciez e menos quebra visível. Crescimento e densidade são processos biológicos: recomendamos protocolo contínuo de 60 a 90 dias para leitura fiel do ciclo capilar." },
            { q: "Funciona em couro oleoso ou com caspa leve?", a: "Sim. A textura sérum-óleo foi balanceada para absorção rápida na raiz; a melaleuca e o jojoba ajudam na sensação de frescor e no controle do excesso de sebo sem pesar no comprimento." },
            { q: "Gestantes ou lactantes podem usar?", a: "Fórmula cosmética hipoalergênica, sem retinol. Mesmo assim, gestantes, lactantes ou quem faz tratamentos capilares prescritos deve confirmar com médico ou tricologista — segurança em primeiro lugar." },
            { q: "Como armazenar o Envy Hair?", a: "Feche bem o frasco, mantenha em local fresco, ao abrigo do sol direto e fora do alcance de crianças para preservar a integridade dos óleos voláteis e botânicos." },
          ].map((item, i) => (
            <div key={i} className="bg-white rounded-2xl border border-[#F2E6EB] overflow-hidden">
              <button 
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full px-6 sm:px-8 py-5 sm:py-6 flex items-center justify-between text-left hover:bg-[#F2E6EB]/50 transition-colors"
              >
                <span className="font-bold text-[#523741] text-sm sm:text-base pr-4">{item.q}</span>
                <ChevronDown className={`text-[#4A8FA8] transition-transform flex-shrink-0 ${openIndex === i ? 'rotate-180' : ''}`} size={20} />
              </button>
              <motion.div 
                initial={false}
                animate={{ height: openIndex === i ? 'auto' : 0, opacity: openIndex === i ? 1 : 0 }}
                className="overflow-hidden"
              >
                <div className="px-6 sm:px-8 pb-6 sm:pb-8 text-xs sm:text-sm text-[#8A6B7A] leading-relaxed">
                  {item.a}
                </div>
              </motion.div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Footer = () => (
  <footer className="bg-white pt-12 sm:pt-20 pb-24 sm:pb-12 border-t border-[#F2E6EB]">
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 sm:gap-12 mb-12 sm:mb-16">
        <div className="space-y-4 sm:space-y-6 text-center sm:text-left">
          <div className="h-8 sm:h-10 flex justify-center sm:justify-start">
            <img 
              src="https://i.ibb.co/Kcb9fST2/image.png" 
              alt="Envy Hair Logo" 
              className="h-full w-auto object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <p className="text-xs sm:text-sm text-[#8A6B7A] leading-relaxed">
            Alta performance capilar com alma de laboratório e acabamento de salão — para você se reconhecer no espelho com segurança.
          </p>
          <div className="flex justify-center sm:justify-start gap-4">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#F2E6EB] flex items-center justify-center text-[#4A8FA8] hover:bg-[#4A8FA8] hover:text-white transition-all cursor-pointer">
              <Instagram size={18} sm:size={20} />
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#F2E6EB] flex items-center justify-center text-[#4A8FA8] hover:bg-[#4A8FA8] hover:text-white transition-all cursor-pointer">
              <Facebook size={18} sm:size={20} />
            </div>
          </div>
        </div>

        <div className="text-center sm:text-left">
          <h4 className="font-bold text-[#523741] mb-4 sm:mb-6 text-sm sm:text-base uppercase tracking-widest">Navegação</h4>
          <ul className="space-y-3 sm:space-y-4 text-xs sm:text-sm text-[#8A6B7A]">
            <li className="hover:text-[#4A8FA8] cursor-pointer transition-colors">Início</li>
            <li className="hover:text-[#4A8FA8] cursor-pointer transition-colors">Benefícios</li>
            <li className="hover:text-[#4A8FA8] cursor-pointer transition-colors">Tecnologia</li>
            <li className="hover:text-[#4A8FA8] cursor-pointer transition-colors">Kits</li>
          </ul>
        </div>

        <div className="text-center sm:text-left">
          <h4 className="font-bold text-[#523741] mb-4 sm:mb-6 text-sm sm:text-base uppercase tracking-widest">Suporte</h4>
          <ul className="space-y-3 sm:space-y-4 text-xs sm:text-sm text-[#8A6B7A]">
            <li className="hover:text-[#4A8FA8] cursor-pointer transition-colors">Rastrear Pedido</li>
            <li className="hover:text-[#4A8FA8] cursor-pointer transition-colors">Políticas de Envio</li>
            <li className="hover:text-[#4A8FA8] cursor-pointer transition-colors">Trocas e Devoluções</li>
            <li className="hover:text-[#4A8FA8] cursor-pointer transition-colors">Termos de Uso</li>
          </ul>
        </div>

        <div className="text-center sm:text-left">
          <h4 className="font-bold text-[#523741] mb-4 sm:mb-6 text-sm sm:text-base uppercase tracking-widest">Contato</h4>
          <ul className="space-y-3 sm:space-y-4 text-xs sm:text-sm text-[#8A6B7A]">
            <li className="flex items-center justify-center sm:justify-start gap-3">
              <Mail size={16} className="text-[#4A8FA8]" />
              sac@zencial.com.br
            </li>
            <li className="flex items-center justify-center sm:justify-start gap-3">
              <ShieldCheck size={16} className="text-[#4A8FA8]" />
              Compra 100% Segura
            </li>
          </ul>
        </div>
      </div>

      <div className="pt-8 sm:pt-12 border-t border-[#F2E6EB] flex flex-col sm:flex-row justify-between items-center gap-6 sm:gap-8">
        <p className="text-[10px] sm:text-xs text-[#8A6B7A] text-center sm:text-left">
          © 2024 Zencial. Todos os direitos reservados. CNPJ: 00.000.000/0001-00
        </p>
        <div className="flex gap-4 sm:gap-6 opacity-50 grayscale hover:grayscale-0 transition-all">
          <CreditCard size={24} sm:size={32} />
          <div className="text-[10px] sm:text-xs font-bold text-[#523741]">VISA</div>
          <div className="text-[10px] sm:text-xs font-bold text-[#523741]">MASTERCARD</div>
          <div className="text-[10px] sm:text-xs font-bold text-[#523741]">PIX</div>
        </div>
      </div>
    </div>
  </footer>
);

// --- Main App ---

export default function App() {
  const [cartCount, setCartCount] = useState(0);
  const [view, setView] = useState<'landing' | 'checkout' | 'pix'>('landing');
  const [selectedKit, setSelectedKit] = useState<any>(null);
  const [orderData, setOrderData] = useState<any>(null);
  const [urlParams, setUrlParams] = useState<Record<string, string>>(() =>
    mergeUrlParamsFromLocation()
  );

  useEffect(() => {
    const sync = () => setUrlParams(mergeUrlParamsFromLocation());
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, [view]);

  const handleAddToCart = (kitData: any) => {
    setSelectedKit(kitData);
    setView('checkout');
    window.scrollTo(0, 0);
  };

  const handleFinishOrder = async (data: any) => {
    const utmPayload = toFruitfyUtmPayload(urlParams);
    const response = await fetch("/api/pix/charge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.customer.name.trim(),
        email: data.customer.email.trim(),
        cpf: onlyDigits(data.customer.cpf),
        phone: onlyDigits(data.customer.phone),
        amount: centsFromBRL(data.total),
        quantity: data.quantity,
        orderBumpsValue: centsFromBRL(data.orderBumpsTotal ?? 0),
        utm: utmPayload,
      }),
    });

    const payload = (await parseResponseJson(response)) as {
      success?: boolean;
      message?: string;
    };

    if (!response.ok || payload?.success === false) {
      const message =
        payload?.message || "Não foi possível criar cobrança PIX na Fruitfy.";
      throw new Error(message);
    }

    const pixData = extractPixFromFruitfyPayload(payload);
    setOrderData({
      ...data,
      total: pixData.amount > 0 ? pixData.amount / 100 : data.total,
      pixCode: pixData.pixCode,
      qrCodeImage: pixData.qrCodeImage,
      orderId: pixData.orderId,
      gatewayPayload: pixData.raw,
    });
    setView('pix');
    window.scrollTo(0, 0);
  };

  if (view === 'checkout' && selectedKit) {
    return <Checkout kit={selectedKit} onBack={() => setView('landing')} onFinish={handleFinishOrder} />;
  }

  if (view === 'pix' && orderData) {
    return <PixSuccess orderData={orderData} onReset={() => setView('landing')} />;
  }

  return (
    <div className="min-h-screen bg-white font-sans selection:bg-[#4A8FA8] selection:text-white">
      <AnnouncementBar />
      <Header cartCount={cartCount} />
      
      <main>
        <LandingHero />
        
        <section className="py-8 bg-white border-y border-[#F2E6EB]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap justify-center items-center gap-8 sm:gap-16 opacity-40 grayscale">
            {["ANVISA", "CRUELTY FREE", "DERMATOLOGICAMENTE TESTADO", "HIPOALERGÊNICO"].map((logo, i) => (
              <span key={i} className="text-[10px] sm:text-xs font-black tracking-widest uppercase text-[#523741]">{logo}</span>
            ))}
          </div>
        </section>

        <DarkHero />

        <Benefits />
        <Technology />
        
        <section className="py-12 sm:py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 sm:gap-16 items-center">
            <div className="order-2 lg:order-1">
              <img 
                src="https://i.ibb.co/67FxGD7T/image.png" 
                alt="Sinergia bioativa capilar" 
                className="rounded-2xl sm:rounded-3xl shadow-2xl"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="order-1 lg:order-2 space-y-4 sm:space-y-6 text-center lg:text-left">
              <h2 className="text-2xl sm:text-4xl font-bold text-[#523741] tracking-tight">
                Por que o Envy Hair funciona?
              </h2>
              <p className="text-sm sm:text-base text-[#8A6B7A] leading-relaxed">
                O problema raramente é “falta de cuidado”: quando o <strong>ciclo capilar entra em lentificação</strong>, 
                o folículo tende à dormência e o fio nasce mais fraco. O Envy Hair foi desenhado para falar com essa biologia — 
                não apenas perfumar o comprimento.
              </p>
              <p className="text-sm sm:text-base text-[#8A6B7A] leading-relaxed">
                Em modelos de penetração e liberação, a combinação alecrim + rícino + melaleuca potencializou em até <strong>71%</strong> a 
                aderência percebida dos lipídios na zona do bulbo versus óleos aplicados de forma isolada*, favorecendo microcirculação, 
                âncora nutritiva na raiz e sensação de couro cabeludo ativo. <span className="text-[10px] opacity-80">*Dados internos de desenvolvimento de formulação; resultados individuais podem variar.</span>
              </p>
            </div>
          </div>
        </section>

        <Ingredients />
        
        <section className="py-12 sm:py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 sm:gap-16 items-center">
            <div className="space-y-6 sm:space-y-8 text-center lg:text-left">
              <h2 className="text-2xl sm:text-4xl font-bold text-[#523741] tracking-tight">Modo de Usar</h2>
              <div className="space-y-6 sm:space-y-8 text-left">
                {[
                  { step: "01", title: "Preparação", desc: "Com o couro cabeludo limpo e úmido ou seco, separe o cabelo em mechas para expor a raiz." },
                  { step: "02", title: "Dosagem", desc: "Aplique de 4 a 6 gotas do Envy Hair direto no couro cabeludo ou na ponta dos dedos." },
                  { step: "03", title: "Massagem", desc: "Faça movimentos circulares por 1 a 2 minutos, do topo à nuca, sem friccionar com unhas." },
                  { step: "04", title: "Frequência", desc: "Use à noite 3 a 5 vezes por semana — ou conforme orientação do seu especialista capilar." },
                ].map((item, i) => (
                  <div key={i} className="flex gap-4 sm:gap-6">
                    <span className="text-3xl sm:text-4xl font-black text-[#DEC9D1] tabular-nums">{item.step}</span>
                    <div className="space-y-1">
                      <h4 className="font-bold text-[#523741] text-sm sm:text-base">{item.title}</h4>
                      <p className="text-xs sm:text-sm text-[#8A6B7A] leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative px-4 sm:px-0">
              <img 
                src="https://i.ibb.co/jvXLj7tf/image.png" 
                alt="Como usar Envy Hair" 
                className="rounded-2xl sm:rounded-3xl shadow-2xl"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-2xl sm:rounded-3xl"></div>
            </div>
          </div>
        </section>

        <Kits onAddToCart={handleAddToCart} />

        <section className="py-20 bg-[#F2E6EB]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center space-y-8">
            <div className="w-20 h-20 bg-[#4A8FA8] text-white rounded-full flex items-center justify-center mx-auto mb-8">
              <ShieldCheck size={40} />
            </div>
            <h2 className="text-3xl font-bold text-[#523741]">Garantia blindada de 30 dias</h2>
            <p className="text-[#8A6B7A] max-w-2xl mx-auto leading-relaxed">
              Confiamos no ritual Envy Hair o suficiente para assumir o risco por você. 
              Se em 30 dias você não perceber menos queda ao pentear, mais brilho ou couro cabeludo mais confortável, 
              devolvemos 100% do investimento — sem letra miúda, sem constrangimento.
            </p>
          </div>
        </section>

        <section className="py-20 bg-[#523741] text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center space-y-12">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Depoimentos reais — e o que especialistas enxergam na raiz</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                { name: "Mariana S.", text: "Eu chorava no banho de tanto cabelo no ralo. Em duas semanas a queda no pentear diminuiu visivelmente — parece que a raiz ‘acordou’.", location: "São Paulo, SP" },
                { name: "Carla M.", text: "Minhas entradas estavam mais claras e o topo ralo. O óleo não pesa, o couro fica fresquinho e já sinto os baby hairs nascendo.", location: "Rio de Janeiro, RJ" },
                { name: "Patrícia L.", text: "Testei de tudo que prometia milagre. O Envy Hair foi o primeiro que combinou ciência com luxo: brilho de salão e fio com corpo de verdade.", location: "Curitiba, PR" },
              ].map((review, i) => (
                <div key={i} className="bg-white/5 p-8 rounded-2xl border border-white/10 text-left space-y-4">
                  <div className="flex text-[#4A8FA8]">
                    {[...Array(5)].map((_, j) => <Star key={j} size={14} fill="currentColor" stroke="none" />)}
                  </div>
                  <p className="text-[#F2E6EB] italic leading-relaxed">"{review.text}"</p>
                  <div>
                    <p className="font-bold text-white">{review.name}</p>
                    <p className="text-xs text-[#C9B0BD]">{review.location}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
        
        <FAQ />
      </main>

      <Footer />
    </div>
  );
}
