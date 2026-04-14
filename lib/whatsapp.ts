const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL!;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY!;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE!;

type EvolutionConfig = {
  apiUrl: string;
  instance: string;
  apiKey: string;
};

async function setUnavailablePresence(customConfig?: EvolutionConfig | null) {
  try {
    if (process.env.EVOLUTION_SET_UNAVAILABLE_AFTER_SEND !== "true") return;

    const apiUrl = customConfig?.apiUrl || EVOLUTION_API_URL;
    const instance = customConfig?.instance || EVOLUTION_INSTANCE;
    const apiKey = customConfig?.apiKey || EVOLUTION_API_KEY;

    await fetch(`${apiUrl}/instance/setPresence/${instance}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        presence: "unavailable",
      }),
    });
  } catch (error) {
    console.log("Erro ao setar presence:", error);
  }
}

export async function sendWhatsAppMessage(
  to: string,
  message: string,
  customConfig?: EvolutionConfig | null
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

    await setUnavailablePresence(customConfig);

    return data;
  } catch (error) {
    console.error("Erro ao enviar mensagem:", error);
  }
}