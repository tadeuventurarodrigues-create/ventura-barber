const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL!;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY!;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE!;

async function setUnavailablePresence() {
  try {
    if (process.env.EVOLUTION_SET_UNAVAILABLE_AFTER_SEND !== "true") return;

    await fetch(`${EVOLUTION_API_URL}/instance/setPresence/${EVOLUTION_INSTANCE}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        presence: "unavailable",
      }),
    });
  } catch (error) {
    console.log("Erro ao setar presence:", error);
  }
}

// 🔥 NOME CORRETO AQUI (IMPORTANTE)
export async function sendWhatsAppMessage(
  to: string,
  message: string,
  customConfig?: {
    apiUrl: string;
    instance: string;
    apiKey: string;
  }
) {
  try {
    const apiUrl = customConfig?.apiUrl || EVOLUTION_API_URL;
    const instance = customConfig?.instance || EVOLUTION_INSTANCE;
    const apiKey = customConfig?.apiKey || EVOLUTION_API_KEY;

    const res = await fetch(`${apiUrl}/message/sendText/${instance}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: to,
        text: message,
      }),
    });

    const data = await res.json();

    // 🔥 ESSENCIAL PRA VOLTAR NOTIFICAÇÃO
    await setUnavailablePresence();

    return data;
  } catch (error) {
    console.error("Erro ao enviar mensagem:", error);
  }
}