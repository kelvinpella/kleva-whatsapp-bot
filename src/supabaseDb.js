const { createClient } = require('@supabase/supabase-js');

class SupabaseHandler {
  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_KEY environment variables');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✓ Supabase client initialized');
  }

  // Upload buffer to Supabase Storage and return public or signed URL
  async uploadBufferToStorage(bucket, destPath, buffer, contentType = 'image/jpeg', makePublic = true) {
    try {
      const { data, error } = await this.supabase.storage.from(bucket).upload(destPath, buffer, { contentType, upsert: false });
      if (error) throw error;

      if (makePublic) {
        const { data: publicData, error: urlError } = this.supabase.storage.from(bucket).getPublicUrl(destPath);
        if (urlError) throw urlError;
        return { path: destPath, url: publicData.publicUrl };
      } else {
        const { data: signedData, error: signErr } = await this.supabase.storage.from(bucket).createSignedUrl(destPath, 60 * 60);
        if (signErr) throw signErr;
        return { path: destPath, url: signedData.signedUrl };
      }
    } catch (err) {
      console.error('Storage upload error:', err.message);
      return null;
    }
  }

  // ==================== PRODUCTS ====================

  async insertProduct(data) {
    try {
      const row = {
        product_uuid: data.uuid,
        group_id: data.groupId,
        group_name: data.groupName,
        image_path: data.imagePath,
        thumbnail_path: data.thumbnailPath || null,
        caption: data.caption || null,
        price: data.price || null,
        currency: data.currency || 'TZS',
        brand: data.brand || null,
        bag_type: data.bagType || null,
        embedding: data.embedding || null,
        embedding_hash: data.embeddingHash || null,
        message_timestamp: data.messageTimestamp || Math.floor(Date.now() / 1000),
        indexed_at: Math.floor(Date.now() / 1000)
      };

      const { data: result, error } = await this.supabase
        .from('products')
        .upsert([row], { onConflict: 'product_uuid', ignoreDuplicates: true })
        .select();

      if (error) throw error;
      return result?.[0] || null;
    } catch (err) {
      console.error('Error inserting product:', err.message);
      throw err;
    }
  }

  async getProductById(id) {
    try {
      const { data, error } = await this.supabase
        .from('products')
        .select()
        .eq('id', id)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows found
      return data;
    } catch (err) {
      console.error('Error fetching product:', err.message);
      return null;
    }
  }

  async getProductsByGroupId(groupId, limit = 50) {
    try {
      const { data, error } = await this.supabase
        .from('products')
        .select()
        .eq('group_id', groupId)
        .order('indexed_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching products by group:', err.message);
      return [];
    }
  }

  async searchSimilarProducts(embeddingHash, minSimilarity = 0.7, limit = 5) {
    try {
      // For now, return products with same embedding hash
      // In Phase 3, this will use Supabase vector search (pgvector)
      const { data, error } = await this.supabase
        .from('products')
        .select()
        .eq('embedding_hash', embeddingHash)
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error searching similar products:', err.message);
      return [];
    }
  }

  async updateProduct(id, data) {
    try {
      const updates = {
        updated_at: new Date().toISOString()
      };

      if (data.embedding) updates.embedding = data.embedding;
      if (data.embeddingHash) updates.embedding_hash = data.embeddingHash;
      if (data.thumbnail_path) updates.thumbnail_path = data.thumbnail_path;
      if (data.price !== undefined) updates.price = data.price;
      if (data.brand) updates.brand = data.brand;
      if (data.bagType) updates.bag_type = data.bagType;

      const { data: result, error } = await this.supabase
        .from('products')
        .update(updates)
        .eq('id', id)
        .select();

      if (error) throw error;
      return result?.[0];
    } catch (err) {
      console.error('Error updating product:', err.message);
      throw err;
    }
  }

  async deleteProductById(id) {
    try {
      const { error } = await this.supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Error deleting product:', err.message);
      throw err;
    }
  }

  // ==================== SUPPLIER GROUPS ====================

  async insertSupplierGroup(groupId, groupName) {
    try {
      const { data, error } = await this.supabase
        .from('supplier_groups')
        .upsert([{
          group_id: groupId,
          group_name: groupName,
          last_checked: Math.floor(Date.now() / 1000)
        }])
        .select();

      if (error) throw error;
      return data?.[0];
    } catch (err) {
      console.error('Error inserting supplier group:', err.message);
      throw err;
    }
  }

  async getSupplierGroups(activeOnly = true) {
    try {
      let query = this.supabase.from('supplier_groups').select();
      
      if (activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching supplier groups:', err.message);
      return [];
    }
  }

  async updateGroupProductCount(groupId) {
    try {
      const { count, error: countError } = await this.supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', groupId);

      if (countError) throw countError;

      const { data, error } = await this.supabase
        .from('supplier_groups')
        .update({
          product_count: count,
          updated_at: new Date().toISOString()
        })
        .eq('group_id', groupId)
        .select();

      if (error) throw error;
      return data?.[0];
    } catch (err) {
      console.error('Error updating group product count:', err.message);
      throw err;
    }
  }

  // ==================== SEARCH HISTORY ====================

  async insertSearchRecord(data) {
    try {
      const { data: result, error } = await this.supabase
        .from('search_history')
        .insert([{
          search_image_path: data.imagePath || null,
          search_embedding_hash: data.embeddingHash || null,
          results_count: data.resultsCount || 0,
          top_match_id: data.topMatchId || null,
          top_match_score: data.topMatchScore || null,
          search_duration_ms: data.durationMs || 0,
          user_number: data.userNumber || null
        }])
        .select();

      if (error) throw error;
      return result?.[0];
    } catch (err) {
      console.error('Error inserting search record:', err.message);
      throw err;
    }
  }

  async getSearchHistory(limit = 100) {
    try {
      const { data, error } = await this.supabase
        .from('search_history')
        .select()
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching search history:', err.message);
      return [];
    }
  }

  // ==================== STATISTICS ====================

  async getStats() {
    try {
      const { data, error } = await this.supabase
        .from('stats')
        .select()
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (err) {
      console.error('Error fetching stats:', err.message);
      return null;
    }
  }

  async updateStats() {
    try {
      // Get counts
      const { count: productCount, error: prodError } = await this.supabase
        .from('products')
        .select('*', { count: 'exact', head: true });

      const { count: groupCount, error: groupError } = await this.supabase
        .from('supplier_groups')
        .select('*', { count: 'exact', head: true });

      const { count: searchCount, error: searchError } = await this.supabase
        .from('search_history')
        .select('*', { count: 'exact', head: true });

      if (prodError || groupError || searchError) {
        throw new Error('Failed to get counts');
      }

      const existing = await this.getStats();

      const statsData = {
        total_products: productCount || 0,
        total_groups: groupCount || 0,
        total_searches: searchCount || 0,
        last_updated: Math.floor(Date.now() / 1000)
      };

      let result;
      if (existing) {
        const { data, error } = await this.supabase
          .from('stats')
          .update(statsData)
          .eq('id', existing.id)
          .select();

        if (error) throw error;
        result = data?.[0];
      } else {
        const { data, error } = await this.supabase
          .from('stats')
          .insert([statsData])
          .select();

        if (error) throw error;
        result = data?.[0];
      }

      return result;
    } catch (err) {
      console.error('Error updating stats:', err.message);
      throw err;
    }
  }

  // ==================== CLEANUP & MAINTENANCE ====================

  async deleteOldProducts(daysOld = 30) {
    try {
      const cutoffTime = Math.floor((Date.now() - daysOld * 24 * 60 * 60 * 1000) / 1000);

      const { error } = await this.supabase
        .from('products')
        .delete()
        .lt('indexed_at', cutoffTime);

      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Error deleting old products:', err.message);
      throw err;
    }
  }

  async deleteOldSearchHistory(daysOld = 90) {
    try {
      const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();

      const { error } = await this.supabase
        .from('search_history')
        .delete()
        .lt('created_at', cutoffDate);

      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Error deleting old search history:', err.message);
      throw err;
    }
  }

  async vacuum() {
    console.log('✓ Supabase auto-maintains indexes (vacuum not needed)');
  }

  async optimizeIndexes() {
    console.log('✓ Supabase auto-optimizes indexes');
  }

  async backup() {
    console.log('✓ Supabase auto-backs up daily');
  }

  async close() {
    console.log('✓ Supabase connection closed (pooled connection)');
  }
}

module.exports = SupabaseHandler;
