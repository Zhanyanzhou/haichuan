import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Req,
  Res,
  UseGuards,
  BadRequestException,
  NotFoundException,
  MessageEvent,
  Sse,
  ParseIntPipe,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from "@nestjs/swagger";
import { ProductsService } from "./products.service";
import { UploadService } from "../upload/upload.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Throttle } from "@nestjs/throttler";
import { CustomerAuthGuard } from "../customers/customer-auth.guard";
import { CustomerOrStaffGuard } from "./customer-or-staff.guard";
import { ProductMediaService } from "./product-media.service";
import { Public } from "../../common/decorators/public.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import {
  CreateProductDto,
  UpdateProductDto,
  CreateCertificateDto,
  UpdateCertificateDto,
  CreateSkuDto,
  UpdateSkuDto,
  PublicProductQueryDto,
  AdminProductQueryDto,
  ResolveProductReferencesDto,
  AddProductImageDto,
  UpdateProductImageDto,
  CropListingImageDto,
} from "./dto";
import { Observable } from "rxjs";
import { ProductStatus, type ProductImage } from "@prisma/client";
import type { Response } from "express";
import { requirePublishedPublicContentLocale } from "../../common/content-locale";
import { BoundedListQueryDto } from "../../common/dto/bounded-list-query.dto";
import type {
  CustomerOrStaffRequest,
  CustomerRequest,
  StaffRequest,
} from "../../common/security/authenticated-principal";
const sharp = require("sharp");

@ApiTags("产品管理")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("SUPER_ADMIN", "ADMIN", "EDITOR")
@Controller("products")
export class ProductsController {
  constructor(
    private productsService: ProductsService,
    private uploadService: UploadService,
    private productMedia: ProductMediaService,
  ) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({
    summary: "获取产品列表",
    description: "支持分类/材质/状态/关键词筛选和分页",
  })
  @ApiQuery({ name: "page", required: false, description: "页码" })
  @ApiQuery({ name: "pageSize", required: false, description: "每页数量" })
  @ApiQuery({ name: "categoryId", required: false, description: "分类ID" })
  @ApiQuery({ name: "keyword", required: false, description: "搜索关键词" })
  findAll(@Query() query: AdminProductQueryDto) {
    return this.productsService.findAll(query);
  }

  @Post("admin/resolve-references")
  @ApiBearerAuth()
  @ApiOperation({ summary: "按稳定 code 或旧 id 解析店铺装修商品引用" })
  resolveReferences(@Body() body: ResolveProductReferencesDto) {
    return this.productsService.resolveReferences(body);
  }

  @Get("admin/publication-quality-report")
  @ApiBearerAuth()
  @ApiOperation({ summary: "只读评估存量已发布商品的发布质量" })
  getPublicationQualityReport() {
    return this.productsService.getPublicationQualityReport();
  }

  @Get("admin/media")
  @ApiBearerAuth()
  @ApiOperation({ summary: "分页获取商品媒体库" })
  listMedia(@Query() query: BoundedListQueryDto) {
    return this.productsService.listMedia(query);
  }

  @Public()
  @Get("public")
  @ApiOperation({ summary: "公开商品列表（仅 PUBLIC + PUBLISHED 安全字段）" })
  findPublic(@Query() query: PublicProductQueryDto) {
    requirePublishedPublicContentLocale(query.locale);
    return this.productsService.findPublic(query);
  }

  @Public()
  @Sse("public/stream")
  publicChangeStream(@Query("locale") locale?: string): Observable<MessageEvent> {
    requirePublishedPublicContentLocale(locale);
    // 旧公开 SSE 保留向后兼容：仅发变更信号，不返回商品数据。前端应迁移到 catalog/stream。
    return this.productsService.publicChangeStream();
  }

  @Public()
  @Get("public/:id")
  @ApiOperation({ summary: "公开商品详情（仅 PUBLIC + PUBLISHED 安全字段）" })
  async findPublicById(
    @Param("id") id: string,
    @Query("locale") locale?: string,
  ) {
    requirePublishedPublicContentLocale(locale);
    const product = await this.productsService.findPublicById(id);
    if (!product) throw new NotFoundException("商品当前不可浏览");
    return product;
  }

  // 媒体端点按"每图一请求"设计：一个列表页几十张图会瞬间耗尽全局 60/min 桶，
  // 导致后续业务 API（列表/询价）被误伤 429。此处单独放宽到 600/min，
  // 保留防刷底线（原图直出有同步读盘成本，不能不限流）。
  @Public()
  @Throttle({ default: { limit: 600, ttl: 60000 } })
  @Get("public/:productId/media/:imageId")
  @ApiOperation({ summary: "公开商品媒体（仅 PUBLIC + PUBLISHED；?width=480/800/1200 动态缩放）" })
  servePublicMedia(
    @Res({ passthrough: false }) response: Response,
    @Param("productId") productId: string,
    @Param("imageId") imageId: string,
    @Query("width") width?: string,
  ) {
    return this.productsService.servePublicMedia(
      +productId,
      +imageId,
      response,
      width,
    );
  }

  /* ═══ 会员商品目录（登录会员 / 合作商家可见）═══ */
  // 客户鉴权说明：全局 JwtAuthGuard 会拒绝客户令牌，此处用 @Public() 旁通全局守卫，
  // 再由方法级 CustomerAuthGuard 强制客户登录。未登录直接 401，无法获取任何商品数据。
  // 以下 catalog 端点必须在 @Get(":id") 之前定义，否则 /products/catalog 会被 :id 当作 id 捕获。
  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get("catalog")
  @ApiOperation({ summary: "受控商品目录（登录后访问，按可见范围过滤）" })
  @ApiQuery({ name: "page", required: false, description: "页码" })
  @ApiQuery({ name: "pageSize", required: false, description: "每页数量" })
  @ApiQuery({ name: "categoryId", required: false, description: "分类ID" })
  @ApiQuery({ name: "keyword", required: false, description: "搜索关键词" })
  @ApiQuery({
    name: "ids",
    required: false,
    description: "按 id 集合拉取（首页/区块用）",
  })
  findCatalog(@Req() request: CustomerRequest, @Query() query: PublicProductQueryDto) {
    requirePublishedPublicContentLocale(query.locale);
    return this.productsService.findCatalog(query, request.customer);
  }

  @Public()
  @Sse("catalog/stream")
  catalogChangeStream(@Query("locale") locale?: string): Observable<MessageEvent> {
    requirePublishedPublicContentLocale(locale);
    // SSE 无法携带 Bearer 头（浏览器 EventSource 限制），此处不鉴权；
    // 安全性由"只发变更信号、绝不返回商品数据"保证：前端收到信号后用鉴权 catalog 接口重拉。
    return this.productsService.publicChangeStream();
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get("catalog/:id")
  @ApiOperation({ summary: "受控商品详情（登录后访问，按可见范围过滤）" })
  async findCatalogById(
    @Req() request: CustomerRequest,
    @Param("id") id: string,
    @Query("locale") locale?: string,
  ) {
    requirePublishedPublicContentLocale(locale);
    const product = await this.productsService.findCatalogById(
      id,
      request.customer,
    );
    if (!product) throw new NotFoundException("商品当前不可浏览");
    return product;
  }

  /* ═══ 受控媒体（图片/视频）═══ */
  // 接受客户令牌或员工令牌；客户访问按可见范围校验，PARTNER 商品对客户叠加水印。
  // 禁止仅凭 imageId 跨商品访问：必须 productId+imageId 联合校验。
  @Public()
  @UseGuards(CustomerOrStaffGuard)
  // 同上：受控媒体每图一请求，单独放宽限流，避免吃满全局 60/min 桶误伤业务接口。
  @Throttle({ default: { limit: 600, ttl: 60000 } })
  @Get("catalog/:productId/media/:imageId")
  @ApiOperation({ summary: "受控商品媒体（需鉴权，PARTNER 商品对客户加水印；?width=480/800/1200）" })
  async getCatalogMedia(
    @Req() request: CustomerOrStaffRequest,
    @Res({ passthrough: false }) response: Response,
    @Param("productId") productId: string,
    @Param("imageId") imageId: string,
    @Query("width") width?: string,
  ) {
    return this.productsService.serveCatalogMedia(
      +productId,
      +imageId,
      request,
      response,
      width,
    );
  }

  @Get("counts")
  @ApiBearerAuth()
  @ApiOperation({ summary: "获取各状态商品数量统计" })
  getCounts() {
    return this.productsService.getCounts();
  }

  @Get(":id")
  @ApiBearerAuth()
  @ApiOperation({ summary: "获取产品详情" })
  findById(@Param("id") id: string) {
    return this.productsService.findById(+id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post()
  @ApiOperation({ summary: "新增产品" })
  async create(@Req() request: StaffRequest, @Body() dto: CreateProductDto) {
    return this.productsService.create(dto, request.user);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put(":id")
  @ApiOperation({ summary: "编辑产品" })
  async update(@Req() request: StaffRequest, @Param("id") id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(+id, dto, request.user);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put(":id/archive")
  @ApiOperation({ summary: "将商品移入回收站" })
  archive(@Req() request: StaffRequest, @Param("id") id: string) {
    return this.productsService.archive(+id, request.user);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put(":id/restore")
  @ApiOperation({ summary: "从回收站恢复商品（恢复为草稿）" })
  restore(@Param("id") id: string) {
    return this.productsService.restore(+id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(":id/submit-review")
  @ApiOperation({ summary: "提交商品草稿审核（不直接发布）" })
  submitForReview(@Req() request: StaffRequest, @Param("id") id: string) {
    return this.productsService.submitForReview(+id, request.user);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put(":id/status")
  @Roles("SUPER_ADMIN", "ADMIN")
  @ApiOperation({ summary: "更新产品状态" })
  async updateStatus(@Req() request: StaffRequest, @Param("id") id: string, @Body("status") status: string) {
    const validStatuses = ["DRAFT", "PUBLISHED", "OFFLINE", "ARCHIVED"];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException("商品状态不正确，请重新选择");
    }
    if (status === "ARCHIVED") {
      return this.productsService.archive(+id, request.user);
    }
    return this.productsService.updateStatus(+id, status as ProductStatus, request.user);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(":id/completeness")
  @ApiOperation({ summary: "检查产品完整性" })
  checkCompleteness(@Param("id") id: string) {
    return this.productsService.checkCompleteness(+id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete(":id")
  @ApiOperation({ summary: "移除回收站商品（已停用：回收站只读，仅支持恢复为草稿）" })
  delete(@Param("id") id: string) {
    return this.productsService.delete(+id);
  }

  /* ═══ 产品图片管理 ═══ */
  /* 注意:静态路由(primary/listing/reset)必须在 :imageId 通配之前定义，
     否则 Express 按顺序匹配时 /images/primary 会被 :imageId 捕获，误命中 updateImage。 */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(":id/images")
  @ApiOperation({ summary: "添加产品图片" })
  addImage(@Req() request: StaffRequest, @Param("id") id: string, @Body() body: AddProductImageDto) {
    return this.productsService.addImage(+id, body, request.user);
  }

  /* ═══ 主图/列表图管理（静态路径，优先匹配） ═══ */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put(":id/images/primary")
  @ApiOperation({ summary: "设置详情主图" })
  setPrimaryImage(@Req() request: StaffRequest, @Param("id") id: string, @Body() body: { imageId: number }) {
    return this.productsService.setPrimaryImage(+id, body.imageId, request.user);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put(":id/images/listing")
  @ApiOperation({ summary: "直接设置列表图（不裁切）" })
  setListingImage(@Req() request: StaffRequest, @Param("id") id: string, @Body() body: { imageId: number }) {
    return this.productsService.setListingImage(+id, body.imageId, request.user);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put(":id/images/listing/reset")
  @ApiOperation({ summary: "恢复列表图为详情主图" })
  resetListingToPrimary(@Req() request: StaffRequest, @Param("id") id: string) {
    return this.productsService.resetListingToPrimary(+id, request.user);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put(":id/images/:imageId")
  @ApiOperation({ summary: "更新图片信息（类型/排序）" })
  updateImage(
    @Req() request: StaffRequest,
    @Param("id", ParseIntPipe) id: number,
    @Param("imageId", ParseIntPipe) imageId: number,
    @Body() body: UpdateProductImageDto,
  ) {
    return this.productsService.updateImage(id, imageId, body, request.user);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete(":id/images/:imageId")
  @ApiOperation({ summary: "删除产品图片" })
  deleteImage(@Req() request: StaffRequest, @Param("id") id: string, @Param("imageId") imageId: string) {
    return this.productsService.deleteImage(+id, +imageId, request.user);
  }

  /* ═══ 列表图裁切 ═══ */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(":id/images/:sourceImageId/crop-listing")
  @ApiOperation({ summary: "裁切生成1200×1200 WebP列表图" })
  async cropListingImage(
    @Req() request: StaffRequest,
    @Param("id") id: string,
    @Param("sourceImageId") sourceImageId: string,
    @Body() dto: CropListingImageDto,
  ) {
    const product = await this.productsService.findById(+id);
    if (!product) throw new NotFoundException("商品不存在");

    const sourceImg = product.images?.find(
      (image) => image.id === +sourceImageId,
    );
    if (!sourceImg) throw new NotFoundException("源图片不属于该商品");

    // 裁切：归一化坐标 → 实际像素 → sharp 处理
    if (!sourceImg.storageKey || !sourceImg.mediaAssetId) {
      throw new BadRequestException("旧商品图尚未关联媒体资产，不能生成新的公开派生图");
    }
    // 读取原图字节与尺寸：只允许已登记的受控私有素材。
    const { buffer: sourceBuffer } =
      await this.productMedia.readProductImage(sourceImg);
    const metadata = await sharp(sourceBuffer).metadata();
    const imgW = metadata.width || 1;
    const imgH = metadata.height || 1;

    // 归一化矩形转实际像素（正方形裁切）
    const cropPx = {
      left: Math.round(dto.x * imgW),
      top: Math.round(dto.y * imgH),
      width: Math.round(dto.width * imgW),
      height: Math.round(dto.height * imgH),
    };

    // 验证裁切范围
    if (
      cropPx.left < 0 ||
      cropPx.top < 0 ||
      cropPx.left + cropPx.width > imgW ||
      cropPx.top + cropPx.height > imgH
    ) {
      throw new BadRequestException("裁切区域超出图片范围");
    }

    const result = await this.uploadService.cropPrivateImage(
      sourceImg.storageKey,
      cropPx,
      1200,
      "webp",
      request.user.id,
    );
    const derived: ProductImage = await this.productsService.addImage(+id, {
      mediaAssetId: result.mediaAssetId,
      storageKey: result.storageKey,
      type: "FRONT",
      sortOrder: 0,
      sourceImageId: +sourceImageId,
      cropData: {
        x: dto.x,
        y: dto.y,
        width: dto.width,
        height: dto.height,
      },
      width: result.width,
      height: result.height,
      mimeType: result.mimeType,
      fileSize: result.fileSize,
    }, request.user);

    // 切换 listingImageId
    await this.productsService.setListingImage(+id, derived.id, request.user);

    return { id: derived.id, listingImageId: derived.id };
  }

  /* ═══ 商品标签管理 ═══ */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(":id/tags")
  @ApiOperation({ summary: "获取商品标签列表" })
  getTags(@Param("id") id: string) {
    return this.productsService.getTags(+id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put(":id/tags")
  @ApiOperation({ summary: "批量更新商品标签" })
  updateTags(@Req() request: StaffRequest, @Param("id") id: string, @Body() body: { tags: string[] }) {
    return this.productsService.updateTags(+id, body.tags || [], request.user);
  }

  /* ═══ 商品属性管理 ═══ */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(":id/attributes")
  @ApiOperation({ summary: "获取商品属性值列表" })
  getAttributes(@Param("id") id: string) {
    return this.productsService.getAttributes(+id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put(":id/attributes")
  @ApiOperation({ summary: "批量设置商品属性值（按 attributeValueId）" })
  updateAttributes(
    @Req() request: StaffRequest,
    @Param("id") id: string,
    @Body() body: { attributeValueIds: number[] },
  ) {
    return this.productsService.setAttributes(
      +id,
      body.attributeValueIds || [],
      request.user,
    );
  }

  /* ═══ 证书管理 ═══ */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(":id/certificates")
  @ApiOperation({ summary: "添加商品证书" })
  addCertificate(@Req() request: StaffRequest, @Param("id") id: string, @Body() dto: CreateCertificateDto) {
    return this.productsService.addCertificate(+id, dto, request.user);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put(":id/certificates/:certId")
  @ApiOperation({ summary: "更新证书信息" })
  updateCertificate(
    @Req() request: StaffRequest,
    @Param("id") id: string,
    @Param("certId") certId: string,
    @Body() dto: UpdateCertificateDto,
  ) {
    return this.productsService.updateCertificate(+id, +certId, dto, request.user);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete(":id/certificates/:certId")
  @ApiOperation({ summary: "删除商品证书" })
  deleteCertificate(@Req() request: StaffRequest, @Param("id") id: string, @Param("certId") certId: string) {
    return this.productsService.deleteCertificate(+id, +certId, request.user);
  }

  /* ═══ SKU 管理 ═══ */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(":id/skus")
  @ApiOperation({ summary: "获取商品SKU列表" })
  getSkus(@Param("id") id: string) {
    return this.productsService.getSkus(+id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(":id/skus")
  @ApiOperation({ summary: "创建商品SKU" })
  createSku(@Req() request: StaffRequest, @Param("id") id: string, @Body() dto: CreateSkuDto) {
    return this.productsService.createSku(+id, dto, request.user);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put(":id/skus/:skuId")
  @ApiOperation({ summary: "更新SKU信息" })
  updateSku(
    @Req() request: StaffRequest,
    @Param("id") id: string,
    @Param("skuId") skuId: string,
    @Body() dto: UpdateSkuDto,
  ) {
    return this.productsService.updateSku(+id, +skuId, dto, request.user);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete(":id/skus/:skuId")
  @ApiOperation({ summary: "彻底删除SKU（若有关联库存/订单则拒绝）" })
  deleteSku(@Req() request: StaffRequest, @Param("id") id: string, @Param("skuId") skuId: string) {
    return this.productsService.deleteSku(+id, +skuId, request.user);
  }
}
