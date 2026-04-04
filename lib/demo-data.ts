export type DemoService = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
};

export type DemoProfessional = {
  id: string;
  name: string;
  specialty: string;
};

export type DemoBarbershop = {
  slug: string;
  name: string;
  description: string;
  address: string;
  services: DemoService[];
  professionals: DemoProfessional[];
};

const demoBarbershops: DemoBarbershop[] = [
  {
    slug: "barbearia-demo",
    name: "Barbearia Demo",
    description:
      "Uma página exemplo do Ventura Barber com visual premium, serviços e profissionais.",
    address: "Rua Exemplo, 123 - Centro",
    services: [
      {
        id: "srv_1",
        name: "Corte",
        description: "Corte com acabamento profissional.",
        durationMinutes: 30,
        price: 30
      },
      {
        id: "srv_2",
        name: "Barba",
        description: "Desenho e alinhamento de barba.",
        durationMinutes: 20,
        price: 20
      },
      {
        id: "srv_3",
        name: "Corte + barba",
        description: "Combo completo com visual renovado.",
        durationMinutes: 50,
        price: 45
      }
    ],
    professionals: [
      {
        id: "pro_1",
        name: "Carlos Ventura",
        specialty: "Degradê, social e acabamento premium"
      },
      {
        id: "pro_2",
        name: "Lucas Silva",
        specialty: "Barba, navalhado e cortes modernos"
      }
    ]
  }
];

export function getDemoBarbershopBySlug(slug: string) {
  return demoBarbershops.find((shop) => shop.slug === slug);
}
