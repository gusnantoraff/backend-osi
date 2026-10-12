import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

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

  constructor(private readonly configService: ConfigService) {}

  async generateRecommendations(
    plantName: string,
    typePlant: string,
    dap: number,
    location: number,
  ): Promise<Recommendations> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      this.logger.error('OPENAI_API_KEY belum terkonfigurasi di Environment Variables!');
      throw new Error('Konfigurasi API Key OpenAI tidak ditemukan.');
    }

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4-turbo',
          messages: [
            {
              role: 'system',
              content:
                'You are an expert in plant care. Provide detailed recommendations EC, pH, humidity, air temperature, water temperature, and waterflow based on plant name, type of plant, and days after planting (DAP).',
            },
            {
              role: 'user',
              content: `Please provide specific and unchanging data EC per day (dS/m), pH, humidity, air temperature, water temperature, and waterflow (liter/m) for a plant with the following details:
                        \n\nPlant Name: ${plantName},
                        \nType of Plant: ${typePlant},
                        \nDAP (Days After Plant) : ${dap},
                        \nbased on Location Coordinate: ${location} and today's weather from https://weather.com/weather/today/l/${location}?par=google,
                        \nfor IoT Hydroponics mqtt`,
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const recommendationsText = response.data?.choices?.[0]?.message?.content;

      if (!recommendationsText) {
        this.logger.warn('Respon dari OpenAI kosong.');
        return this.getEmptyRecommendations();
      }

      return this.parseRecommendations(recommendationsText);
    } catch (error) {
      // Menampilkan log detail error dari OpenAI/Axios ke terminal server
      if (axios.isAxiosError(error)) {
        this.logger.error(
          'OpenAI API Request Error:',
          JSON.stringify(error.response?.data || error.message),
        );
      } else {
        this.logger.error('Unexpected Error during AI generation:', error);
      }

      throw error;
    }
  }

  private parseRecommendations(recommendationsText: string): Recommendations {
    const recommendations: Recommendations = this.getEmptyRecommendations();

    try {
      const ecMatch = recommendationsText.match(/EC.*?:.*?(\d+(\.\d+)?)(\s*dS\/m)/i);
      const phMatch = recommendationsText.match(/pH.*?:.*?(\d+(\.\d+)?).*?(\d+(\.\d+)?)/i);
      const humidityMatch = recommendationsText.match(/humidity.*?:.*?(\d+(\.\d+)?%)/i);
      const airTempMatch = recommendationsText.match(
        /air temperature.*?:.*?(\d+(\.\d+)?(°C|degrees Celsius)).*?(\d+(\.\d+)?(°C|degrees Celsius))/i,
      );
      const waterTempMatch = recommendationsText.match(
        /water temperature.*?:.*?(\d+(\.\d+)?(°C|degrees Celsius))/i,
      );
      const waterflowMatch = recommendationsText.match(/waterflow.*?:.*?(\d+(\.\d+)?)/i);

      if (ecMatch && ecMatch[1]) {
        recommendations.ec = parseFloat(ecMatch[1]);
      }

      if (phMatch && phMatch[1] && phMatch[3]) {
        recommendations.ph = [parseFloat(phMatch[1]), parseFloat(phMatch[3])];
      }

      if (humidityMatch && humidityMatch[1]) {
        recommendations.humidity = parseFloat(humidityMatch[1].replace('%', ''));
      }

      if (airTempMatch && airTempMatch[1] && airTempMatch[4]) {
        const minTemp = parseFloat(
          airTempMatch[1].replace('°C', '').replace('degrees Celsius', '').trim(),
        );
        const maxTemp = parseFloat(
          airTempMatch[4].replace('°C', '').replace('degrees Celsius', '').trim(),
        );
        recommendations.temperature_air = [minTemp, maxTemp];
      }

      if (waterTempMatch && waterTempMatch[1]) {
        recommendations.temperature_water = parseFloat(
          waterTempMatch[1].replace('°C', '').replace('degrees Celsius', '').trim(),
        );
      }

      if (waterflowMatch && waterflowMatch[1]) {
        recommendations.water_flow = parseFloat(waterflowMatch[1]);
      }
    } catch (parseError) {
      this.logger.error('Gagal melakukan parsing teks dari OpenAI:', parseError);
    }

    return recommendations;
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
