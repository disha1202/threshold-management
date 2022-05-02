import { ProductService } from "@/services/ProductService";
import { ActionTree } from 'vuex'
import RootState from '@/store/RootState'
import ProductState from './ProductState'
import * as types from './mutation-types'
import { hasError, showToast } from '@/utils'
import { translate } from '@/i18n'
import emitter from '@/event-bus'


const actions: ActionTree<ProductState, RootState> = {

  // Find Product
  async findProduct ({ commit, state }, payload) {

    // Show loader only when new query and not the infinite scroll
    if (payload.viewIndex === 0) emitter.emit("presentLoader");

    let resp;

    try {
      resp = await ProductService.fetchProducts({
        // used sku as we are currently only using sku to search for the product
        "filters": ['sku: ' + payload.queryString],
        "viewSize": payload.viewSize,
        "viewIndex": payload.viewIndex
      })

      // resp.data.response.numFound tells the number of items in the response
      if (resp.status === 200 && resp.data.response.numFound > 0 && !hasError(resp)) {
        let products = resp.data.response.docs;
        const totalProductsCount = resp.data.response.numFound;

        if (payload.viewIndex && payload.viewIndex > 0) products = state.products.list.concat(products)
      } else {
        //showing error whenever getting no products in the response or having any other error
        showToast(translate("Product not found"));
      }
      // Remove added loader only when new query and not the infinite scroll
      if (payload.viewIndex === 0) emitter.emit("dismissLoader");
    } catch(error){
      console.log(error)
      showToast(translate("Something went wrong"));
    }
    // TODO Handle specific error
    return resp;
  },

  async fetchProducts({ commit, state }, { productIds }) {
    const cachedProducts = JSON.parse(JSON.stringify(state.cached));
    const cachedProductIds = Object.keys(state.cached);
    const productIdFilter = productIds.reduce((filter: string, productId: any) => {
      if (cachedProductIds.includes(productId)) {
        return filter;
      } else {
        if (filter !== '') filter += ' OR '
        return filter += productId;
      }
    }, '');

    if (productIdFilter === '') return cachedProducts;

    const resp = await ProductService.fetchProducts({
      "filters": ['productId: (' + productIdFilter + ')'],
      "viewSize": productIds.length
    })
    if (resp.status === 200 && !hasError(resp)) {
      const products = resp.data.response.docs;
      if (resp.data) {
        products.forEach((product: any) => {
          cachedProducts[product.productId] = product
        });
      }
      commit(types.PRODUCT_CACHED_UPDATED, { cached: cachedProducts });
      return cachedProducts;
    }
    return resp;
  },

  async getProducts({ commit, state }, payload) {
    let resp;

    try {
      resp = await ProductService.getProducts(payload);

      if (resp.status === 200 && resp.data.grouped.groupId?.ngroups > 0 && !hasError(resp)) {
        let products = resp.data.grouped.groupId?.groups;
        const totalProductsCount = resp.data.grouped.groupId.ngroups;
        
        products = products.map((product: any) => {
          return {
            productId: product.groupValue,
            productName: product.doclist.docs[0]?.parentProductName,
            variants: product.doclist.docs
          }
        })

        let productIds: any = new Set();
        products.forEach((product: any) => {
          if(product.productId) productIds.add(product.productId);
        })
        productIds = [...productIds]
        const productInformation = await this.dispatch("product/fetchProducts", { productIds });

        products = products.map((product: any) => {
          product.variants.map((variant: any) => {
            return {
              ...variant,
              isSelected: false
            }
          });
          const virtual = productInformation[product.productId]

          return {
            ...product,
            isSelected: false,
            brandName: virtual?.brandName,
            productName: virtual?.productName,
            internalName: virtual?.internalName,
            mainImageUrl: virtual?.mainImageUrl,
            featureHierarchy: virtual?.featureHierarchy
          }
        })

        
        if(payload.json.params.start && payload.json.params.start > 0) products = state.products.list.concat(products);
        commit(types.PRODUCT_LIST_UPDATED, { products, totalProductsCount });
      } else {
        showToast(translate("Products not found"));
      }
    } catch (error) {
      console.error(error);
      showToast(translate("Something went wrong"));
    }
    return resp;
  },
}

export default actions;