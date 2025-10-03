const mockSupabase = {
  _data: {
    scores: [],
    users: [],
  },
  from(tableName: string) {
    return {
      select: () => this.from(tableName),
      eq: () => this.from(tableName),
      order: () => this.from(tableName),
      limit: () => this.from(tableName),
      single: async () => ({ data: null, error: null }),
      insert: async (data: any) => ({ data, error: null }),
      async then(resolve: any) {
        resolve({ data: [], error: null });
      },
    };
  },
};

export const supabase = mockSupabase;
