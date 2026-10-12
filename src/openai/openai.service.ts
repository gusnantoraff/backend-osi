import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Type } from '@google/genai';

export interface Recommendations {
  ec: number | null;
  ph: number[] | null;
  humidity: number | null;
  temperature_air: number[] | null;
  temperature_water: number | null;
  water_flow: number | null;
}

@Injectable()
export class OpenAiService {
  private readonly logger = new Logger(OpenAiService.name);
  private ai: GoogleGenAI;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    }
  }

  async generateRecommendations(
    plantName: string,
    typePlant: string,
    dap: number,
    location: number,
  ): Promise<Recommendations> {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');

    if (!apiKey) {
      this.logger.error('GEMINI_API_KEY belum terkonfigurasi di Environment Variables!');
      throw new Error('Konfigurasi API Key Gemini tidak ditemukan.');
    }

    if (!this.ai) {
      this.ai = new GoogleGenAI({ apiKey });
    }

    try {
      // Menggunakan Gemini 1.5 Flash (Gratis & Sangat Cepat)
      const response = await this.ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: `Provide optimal hydroponic parameters for:
        - Plant Name: ${plantName}
        - Type of Plant: ${typePlant}
        - DAP (Days After Planting): ${dap}
        - Location Coordinate: ${location}`,
        config: {
          systemInstruction:
            'You are an expert in plant care and IoT Hydroponics. Provide precise numeric values for EC, pH range, humidity, air temperature range, water temperature, and water flow.',
          responseMimeType: 'application/json',
          // Menentukan skema JSON agar Gemini mengembalikan struktur yang presisi
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              ec: { type: Type.NUMBER, description: 'EC in dS/m' },
              ph: {
                type: Type.ARRAY,
                items: { type: Type.NUMBER },
                description: 'pH range [min, max]',
              },
              humidity: { type: Type.NUMBER, description: 'Humidity percentage' },
              temperature_air: {
                type: Type.ARRAY,
                items: { type: Type.NUMBER },
                description: 'Air temperature range in Celsius [min, max]',
              },
              temperature_water: {
                type: Type.NUMBER,
                description: 'Water temperature in Celsius',
              },
              water_flow: {
                type: Type.NUMBER,
                description: 'Water flow in liters per minute',
              },
            },
            required: [
              'ec',
              'ph',
              'humidity',
              'temperature_air',
              'temperature_water',
              'water_flow',
            ],
          },
        },
      });

      const responseText = response.text;

      if (!responseText) {
        this.logger.warn('Respon dari Gemini kosong.');
        return this.getEmptyRecommendations();
      }

      // Langsung parse JSON (tanpa perlu Regex)
      const parsedRecommendations: Recommendations = JSON.parse(responseText);
      return parsedRecommendations;

    } catch (error) {
      this.logger.error(
        'Gemini API Error:',
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  private getEmptyRecommendations(): Recommendations {
    return {
      ec: null,
      ph: null,
      humidity: null,
      temperature_air: null,
      temperature_water: null,
      water_flow: null,
    };
  }
}