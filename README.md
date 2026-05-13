# 🚀 Ventura Barber

Sistema completo de agendamento para barbearias com integração automática via WhatsApp.

## 📌 Sobre o projeto

O **Ventura Barber** é uma plataforma SaaS para barbearias que permite:

- site público de agendamento
- painel da barbearia
- painel administrativo
- notificações automáticas via WhatsApp
- estrutura multi-barbearias

## ⚙️ Tecnologias

- Next.js 15
- Supabase
- PostgreSQL
- Evolution API
- Vercel

## 🌐 Funcionalidades

### Cliente
- agendamento online
- escolha de serviço, barbeiro e horário
- confirmação automática via WhatsApp

### Barbearia / Barbeiro
- visualização da agenda
- gestão de horários
- cancelamento e remarcação
- recebimento de notificações

### Admin
- cadastro de barbearias
- cadastro e edição de barbeiros
- cadastro de serviços
- configuração de horários
- configuração da Evolution por barbeiro

## 📲 Integração com WhatsApp

O sistema usa a **Evolution API** para:

- confirmar agendamentos
- avisar remarcações
- avisar cancelamentos
- responder comandos no WhatsApp, como:
  - `agendamentos hoje`
  - `agendamentos amanhã`

## ⚙️ Configuração da Evolution

Cada barbeiro pode ter sua própria configuração:

- **URL da API**
- **nome da instância**
- **API Key**

Exemplo:

```text
URL da API: https://seu-servidor-ou-ngrok
Instância: nome-da-instancia
API Key: sua-chave
```

Webhook da Evolution:

```text
https://SEU-DOMINIO/api/webhook
```

## 🧱 Estrutura do projeto

```bash
app/
 ├── admin/
 ├── shop/
 ├── api/
 │   ├── bookings/
 │   ├── webhook/
 │   └── admin/
components/
lib/
```

## 🗄️ Banco de dados

Tabelas principais:

- `barbershops`
- `professionals`
- `services`
- `customers`
- `bookings`
- `booking_cancellations`
- `booking_reschedules`

## 🧪 Rodando localmente

```bash
npm install
npm run dev
```

## 🚀 Deploy

Compatível com:

- Vercel
- Railway
- VPS
- Docker

## ⚠️ Observações importantes

- Ngrok é indicado apenas para testes
- Para produção, o ideal é usar servidor fixo
- A Evolution precisa estar online para enviar mensagens
- Os números de WhatsApp devem estar válidos

## 💰 Modelo de negócio

Esse sistema pode ser usado para:

- cobrar mensalidade por barbearia
- vender como sistema pronto
- oferecer como serviço de automação

## 🎯 Diferenciais

- confirmação automática no WhatsApp
- remarcação e cancelamento com aviso automático
- estrutura multi-barbearias
- painel simples e prático
- configuração de Evolution por barbeiro

## 👨‍💻 Autor

**Tadeu Ventura**

## 📈 Próximos passos

- dashboard financeiro mais completo
- pagamento online
- app mobile
- IA para atendimento automático

---

## Resumo comercial

> Sistema de agendamento para barbearias com confirmação automática via WhatsApp, pensado para organização, automação e venda em modelo SaaS.
