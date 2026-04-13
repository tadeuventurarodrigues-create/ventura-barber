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

export async function sendWhatsappMessage(to: string, message: string) {
  try {
    const res = await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number: to,
        text: message,
      }),
    });

    const data = await res.json();

    // 🔥 AQUI É A MÁGICA
    await setUnavailablePresence();

    return data;
  } catch (error) {
    console.error("Erro ao enviar mensagem:", error);
  }
}