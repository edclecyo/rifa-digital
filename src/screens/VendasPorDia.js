import { Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

export default function VendasPorDia({ dados }) {
  const screenWidth = Dimensions.get('window').width;

  return (
    <LineChart
      data={{
        labels: dados.map(d => d.dia),
        datasets: [
          {
            data: dados.map(d => d.total),
          },
        ],
      }}
      width={screenWidth - 40}
      height={220}
      yAxisSuffix="R$"
      chartConfig={{
        backgroundColor: '#0f172a',
        backgroundGradientFrom: '#0f172a',
        backgroundGradientTo: '#1e293b',
        decimalPlaces: 2,
        color: () => '#22c55e',
        labelColor: () => '#cbd5f5',
      }}
      style={{ borderRadius: 16 }}
    />
  );
}
