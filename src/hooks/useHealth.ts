import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/api';

export function useHealth() {
  const api = useApi();
  return useQuery({ queryKey: ['health', api.source], queryFn: () => api.health(), retry: 0, staleTime: 30_000 });
}
