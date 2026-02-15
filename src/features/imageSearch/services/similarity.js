/**
 * Similarity Calculator
 * Calculates similarity between image embeddings for search
 */

/**
 * Calculate Hamming distance between two strings (character comparison)
 */
function hammingDistance(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) {
    return Infinity;
  }
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) distance++;
  }
  return distance;
}

/**
 * Bit-level Hamming distance for hex strings (perceptual hash)
 * Lower distance = more similar
 */
function hammingDistanceBits(hex1, hex2) {
  if (!hex1 || !hex2 || hex1.length !== hex2.length) return Infinity;
  let distance = 0;
  for (let i = 0; i < hex1.length; i++) {
    let x = (parseInt(hex1[i], 16) || 0) ^ (parseInt(hex2[i], 16) || 0);
    while (x) {
      distance += x & 1;
      x >>= 1;
    }
  }
  return distance;
}

/**
 * Convert Hamming distance to similarity score (0-1)
 * 1 = identical, 0 = completely different
 */
function distanceToSimilarity(distance, maxDistance = 256) {
  return Math.max(0, 1 - distance / maxDistance);
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(vec1, vec2) {
  if (!vec1 || !vec2 || vec1.length !== vec2.length) {
    return 0;
  }

  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    magnitude1 += vec1[i] * vec1[i];
    magnitude2 += vec2[i] * vec2[i];
  }

  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);

  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  return dotProduct / (magnitude1 * magnitude2);
}

/**
 * Calculate similarity between two hash embeddings
 */
function calculateHashSimilarity(hash1, hash2) {
  const distance = hammingDistance(hash1, hash2);
  return distanceToSimilarity(distance);
}

/**
 * Perceptual hash similarity (bit-level Hamming, 64-bit hash)
 */
function calculatePHashSimilarity(hex1, hex2) {
  const distance = hammingDistanceBits(hex1, hex2);
  return distanceToSimilarity(distance, 64);
}

/**
 * Compare image with database products (hash only)
 */
function findSimilarProducts(searchEmbedding, products, minSimilarity = 0.7) {
  const results = [];

  for (const product of products) {
    const similarity = calculateHashSimilarity(searchEmbedding, product.embedding_hash);

    if (similarity >= minSimilarity) {
      results.push({
        ...product,
        similarity: parseFloat(similarity.toFixed(2))
      });
    }
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return results;
}

/**
 * Hybrid similarity: pHash (structure) + color histogram (colors)
 *
 * STRUCTURE-ONLY MATCHING (backgrounds cause too many false positives):
 * 1. Uses ONLY pHash (100% structure, 0% color) - histogram disabled
 * 2. Requires minimum 65% structural similarity for matches
 * 3. Backgrounds, lighting, and colors are completely ignored
 *
 * Why structure-only:
 * - Histogram includes backgrounds → too much noise
 * - Different bags + same background = FALSE POSITIVE (even with 85% pHash weight!)
 * - Same bag + different background = FALSE NEGATIVE
 * - pHash alone is more reliable for handbag shape/design matching
 *
 * Trade-offs:
 * - May miss bags with VERY different angles/crops (acceptable)
 * - Will NOT match based on color alone (correct behavior)
 * - Backgrounds completely ignored (solves the main problem)
 */
function findSimilarProductsHybrid(searchPHash, searchHistogram, products, minSimilarity = 0.7, pHashWeight = 1.0) {
  const results = [];
  const MIN_PHASH_THRESHOLD = 0.65; // Structure must be at least 65% similar (strict)

  for (const product of products) {
    const hashSim = calculatePHashSimilarity(searchPHash, product.embedding_hash || '');

    // CRITICAL: Strict structural similarity requirement
    // Backgrounds caused false positives even at 85% weight - so we ignore histogram entirely
    if (hashSim < MIN_PHASH_THRESHOLD) {
      continue; // Skip this product entirely
    }

    // HISTOGRAM DISABLED: Backgrounds cause too many false matches
    // Using pHash (structure) ONLY for reliable matching
    // Color histogram is still calculated but NOT used in similarity score
    let histSim = 0;
    if (product.embedding && searchHistogram) {
      try {
        const hist = typeof product.embedding === 'string' ? JSON.parse(product.embedding) : product.embedding;
        if (Array.isArray(hist)) histSim = cosineSimilarity(searchHistogram, hist);
      } catch (_) {}
    }

    // Structure-only: 100% pHash, 0% histogram
    const similarity = hashSim; // Pure structural similarity

    if (similarity >= minSimilarity) {
      results.push({
        ...product,
        similarity: parseFloat(similarity.toFixed(2)),
        // Debug info for understanding match quality
        pHashSimilarity: parseFloat(hashSim.toFixed(2)),
        histogramSimilarity: parseFloat(histSim.toFixed(2))
      });
    }
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return results;
}

/**
 * TensorFlow-based semantic similarity (MobileNet embeddings)
 *
 * SEMANTIC MATCHING with deep learning:
 * 1. Uses 1280-dimensional MobileNet v2 embeddings
 * 2. Pure cosine similarity between semantic feature vectors
 * 3. Background-invariant - focuses on object content, not context
 * 4. Captures shape, texture, and semantic meaning
 *
 * Why TensorFlow + MobileNet:
 * - Pre-trained on ImageNet (1M+ images, 1000 categories)
 * - Understands handbag features semantically (shape, texture, design)
 * - Ignores backgrounds, lighting, and non-object features
 * - Much more robust than pHash for real-world matching
 *
 * Advantages over pHash:
 * - No false positives from similar backgrounds
 * - Matches same bag across different angles/lighting/backgrounds
 * - Better at recognizing similar designs (not just pixel similarity)
 *
 * @param {Array<number>} searchEmbedding - 1280-dim MobileNet embedding
 * @param {Array<Object>} products - Database products with embeddings
 * @param {number} minSimilarity - Minimum similarity threshold (0.65-0.75 recommended)
 * @returns {Array<Object>} Sorted results with similarity scores
 */
function findSimilarProductsTensorFlow(searchEmbedding, products, minSimilarity = 0.65) {
  const results = [];

  for (const product of products) {
    // Parse embedding from database (stored as JSON string)
    let productEmbedding;
    try {
      productEmbedding = typeof product.embedding === 'string'
        ? JSON.parse(product.embedding)
        : product.embedding;
    } catch (err) {
      console.warn(`Skipping product ${product.id}: invalid embedding format`);
      continue;
    }

    // Validate embedding format (MobileNet v2 = 1280 dimensions)
    if (!Array.isArray(productEmbedding) || productEmbedding.length !== 1280) {
      console.warn(`Skipping product ${product.id}: embedding is not a 1280-dim array (got ${productEmbedding?.length})`);
      continue;
    }

    // Calculate cosine similarity
    const similarity = cosineSimilarity(searchEmbedding, productEmbedding);

    if (similarity >= minSimilarity) {
      results.push({
        ...product,
        similarity: parseFloat(similarity.toFixed(3)) // 3 decimals for precision
      });
    }
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return results;
}

/**
 * Multi-feature similarity matching (Phase 3 enhancement)
 *
 * Combines three complementary features:
 * 1. Semantic embeddings (MobileNet, 1280-dim) - overall shape/design
 * 2. Texture features (edge histogram, 16-dim) - surface patterns, hardware, stitching
 * 3. Color features (RGB stats, 6-dim) - color identity without background
 *
 * Weight rationale:
 * - Semantic (60%): Captures overall shape/design, most discriminative
 * - Texture (25%): Captures material/pattern details, background-invariant
 * - Color (15%): Captures color identity, less weight due to lighting variation
 *
 * Background-invariance:
 * - Texture: Edges are material-specific, backgrounds have fewer edges
 * - Color: Extracted from center 60% crop, avoids background edges
 * - Semantic: MobileNet ignores background by design
 *
 * @param {Object} searchFeatures - { embedding, textureFeatures, colorFeatures }
 * @param {Array<Object>} products - Database products with all feature types
 * @param {number} minSimilarity - Minimum combined similarity threshold (default 0.70)
 * @returns {Array<Object>} Sorted results with similarity breakdown
 */
function findSimilarProductsMultiFeature(searchFeatures, products, minSimilarity = 0.70) {
  const results = [];

  // Feature weights (tuned for handbag discrimination)
  const SEMANTIC_WEIGHT = 0.60;
  const TEXTURE_WEIGHT = 0.25;
  const COLOR_WEIGHT = 0.15;

  for (const product of products) {
    try {
      // Parse product features
      const productSemantic = typeof product.embedding === 'string'
        ? JSON.parse(product.embedding)
        : product.embedding;

      const productTexture = product.texture_features
        ? (typeof product.texture_features === 'string'
            ? JSON.parse(product.texture_features)
            : product.texture_features)
        : null;

      const productColor = product.color_features
        ? (typeof product.color_features === 'string'
            ? JSON.parse(product.color_features)
            : product.color_features)
        : null;

      // Validate semantic embedding (required)
      if (!Array.isArray(productSemantic) || productSemantic.length !== 1280) {
        console.warn(`Skipping product ${product.id}: invalid semantic embedding`);
        continue;
      }

      // Calculate semantic similarity (always present)
      const semanticSim = cosineSimilarity(searchFeatures.embedding, productSemantic);

      // Calculate texture similarity (if available)
      let textureSim = 0;
      if (productTexture && Array.isArray(productTexture) && productTexture.length === 16) {
        textureSim = cosineSimilarity(searchFeatures.textureFeatures, productTexture);
      }

      // Calculate color similarity (if available)
      let colorSim = 0;
      if (productColor && Array.isArray(productColor) && productColor.length === 6) {
        colorSim = cosineSimilarity(searchFeatures.colorFeatures, productColor);
      }

      // Adjust weights if features missing (backward compatibility)
      let semanticW = SEMANTIC_WEIGHT;
      let textureW = TEXTURE_WEIGHT;
      let colorW = COLOR_WEIGHT;

      if (!productTexture || !productColor) {
        // Fallback: redistribute weights to available features
        if (!productTexture && !productColor) {
          semanticW = 1.0; // Semantic only
          textureW = 0;
          colorW = 0;
        } else if (!productTexture) {
          semanticW = 0.80;
          textureW = 0;
          colorW = 0.20;
        } else if (!productColor) {
          semanticW = 0.70;
          textureW = 0.30;
          colorW = 0;
        }
      }

      // Combined weighted similarity
      const combinedSimilarity =
        (semanticSim * semanticW) +
        (textureSim * textureW) +
        (colorSim * colorW);

      if (combinedSimilarity >= minSimilarity) {
        results.push({
          ...product,
          similarity: parseFloat(combinedSimilarity.toFixed(3)),
          // Debug breakdown for understanding match quality
          semanticSimilarity: parseFloat(semanticSim.toFixed(3)),
          textureSimilarity: parseFloat(textureSim.toFixed(3)),
          colorSimilarity: parseFloat(colorSim.toFixed(3))
        });
      }
    } catch (err) {
      console.warn(`Error processing product ${product.id}:`, err.message);
      continue;
    }
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return results;
}

module.exports = {
  hammingDistance,
  hammingDistanceBits,
  distanceToSimilarity,
  cosineSimilarity,
  calculateHashSimilarity,
  calculatePHashSimilarity,
  findSimilarProducts,
  findSimilarProductsHybrid,
  findSimilarProductsTensorFlow,
  findSimilarProductsMultiFeature  // NEW: Multi-feature matching
};
