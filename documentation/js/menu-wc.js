'use strict';


customElements.define('compodoc-menu', class extends HTMLElement {
    constructor() {
        super();
        this.isNormalMode = this.getAttribute('mode') === 'normal';
    }

    connectedCallback() {
        this.render(this.isNormalMode);
    }

    render(isNormalMode) {
        let tp = lithtml.html(`
        <nav>
            <ul class="list">
                <li class="title">
                    <a href="index.html" data-type="index-link">mwsys documentation</a>
                </li>

                <li class="divider"></li>
                ${ isNormalMode ? `<div id="book-search-input" role="search"><input type="text" placeholder="Type to search"></div>` : '' }
                <li class="chapter">
                    <a data-type="chapter-link" href="index.html"><span class="icon ion-ios-home"></span>Getting started</a>
                    <ul class="links">
                        <li class="link">
                            <a href="overview.html" data-type="chapter-link">
                                <span class="icon ion-ios-keypad"></span>Overview
                            </a>
                        </li>
                        <li class="link">
                            <a href="index.html" data-type="chapter-link">
                                <span class="icon ion-ios-paper"></span>README
                            </a>
                        </li>
                                <li class="link">
                                    <a href="dependencies.html" data-type="chapter-link">
                                        <span class="icon ion-ios-list"></span>Dependencies
                                    </a>
                                </li>
                    </ul>
                </li>
                    <li class="chapter modules">
                        <a data-type="chapter-link" href="modules.html">
                            <div class="menu-toggler linked" data-toggle="collapse" ${ isNormalMode ?
                                'data-target="#modules-links"' : 'data-target="#xs-modules-links"' }>
                                <span class="icon ion-ios-archive"></span>
                                <span class="link-name">Modules</span>
                                <span class="icon ion-ios-arrow-down"></span>
                            </div>
                        </a>
                        <ul class="links collapse " ${ isNormalMode ? 'id="modules-links"' : 'id="xs-modules-links"' }>
                            <li class="link">
                                <a href="modules/AppModule.html" data-type="entity-link">AppModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ?
                                            'data-target="#components-links-module-AppModule-e28e8679a0037a0a633d7fc269c66d1e"' : 'data-target="#xs-components-links-module-AppModule-e28e8679a0037a0a633d7fc269c66d1e"' }>
                                            <span class="icon ion-md-cog"></span>
                                            <span>Components</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="components-links-module-AppModule-e28e8679a0037a0a633d7fc269c66d1e"' :
                                            'id="xs-components-links-module-AppModule-e28e8679a0037a0a633d7fc269c66d1e"' }>
                                            <li class="link">
                                                <a href="components/AppComponent.html"
                                                    data-type="entity-link" data-context="sub-entity" data-context-id="modules">AppComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/LoginComponent.html"
                                                    data-type="entity-link" data-context="sub-entity" data-context-id="modules">LoginComponent</a>
                                            </li>
                                        </ul>
                                    </li>
                            </li>
                            <li class="link">
                                <a href="modules/AppRoutingModule.html" data-type="entity-link">AppRoutingModule</a>
                            </li>
                            <li class="link">
                                <a href="modules/CoreModule.html" data-type="entity-link">CoreModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ?
                                            'data-target="#components-links-module-CoreModule-b5c0389f908dd40c6b5a94830ec60f18"' : 'data-target="#xs-components-links-module-CoreModule-b5c0389f908dd40c6b5a94830ec60f18"' }>
                                            <span class="icon ion-md-cog"></span>
                                            <span>Components</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="components-links-module-CoreModule-b5c0389f908dd40c6b5a94830ec60f18"' :
                                            'id="xs-components-links-module-CoreModule-b5c0389f908dd40c6b5a94830ec60f18"' }>
                                            <li class="link">
                                                <a href="components/NavbarComponent.html"
                                                    data-type="entity-link" data-context="sub-entity" data-context-id="modules">NavbarComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/TmstmpComponent.html"
                                                    data-type="entity-link" data-context="sub-entity" data-context-id="modules">TmstmpComponent</a>
                                            </li>
                                        </ul>
                                    </li>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ?
                                        'data-target="#directives-links-module-CoreModule-b5c0389f908dd40c6b5a94830ec60f18"' : 'data-target="#xs-directives-links-module-CoreModule-b5c0389f908dd40c6b5a94830ec60f18"' }>
                                        <span class="icon ion-md-code-working"></span>
                                        <span>Directives</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="directives-links-module-CoreModule-b5c0389f908dd40c6b5a94830ec60f18"' :
                                        'id="xs-directives-links-module-CoreModule-b5c0389f908dd40c6b5a94830ec60f18"' }>
                                        <li class="link">
                                            <a href="directives/TabDirective.html"
                                                data-type="entity-link" data-context="sub-entity" data-context-id="modules">TabDirective</a>
                                        </li>
                                    </ul>
                                </li>
                            </li>
                            <li class="link">
                                <a href="modules/FrmsalesModule.html" data-type="entity-link">FrmsalesModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ?
                                            'data-target="#components-links-module-FrmsalesModule-66cbdd0f0482290be92f7833b5139897"' : 'data-target="#xs-components-links-module-FrmsalesModule-66cbdd0f0482290be92f7833b5139897"' }>
                                            <span class="icon ion-md-cog"></span>
                                            <span>Components</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="components-links-module-FrmsalesModule-66cbdd0f0482290be92f7833b5139897"' :
                                            'id="xs-components-links-module-FrmsalesModule-66cbdd0f0482290be92f7833b5139897"' }>
                                            <li class="link">
                                                <a href="components/FrmsalesComponent.html"
                                                    data-type="entity-link" data-context="sub-entity" data-context-id="modules">FrmsalesComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/JmeitblComponent.html"
                                                    data-type="entity-link" data-context="sub-entity" data-context-id="modules">JmeitblComponent</a>
                                            </li>
                                        </ul>
                                    </li>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ?
                                            'data-target="#pipes-links-module-FrmsalesModule-66cbdd0f0482290be92f7833b5139897"' : 'data-target="#xs-pipes-links-module-FrmsalesModule-66cbdd0f0482290be92f7833b5139897"' }>
                                            <span class="icon ion-md-add"></span>
                                            <span>Pipes</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="pipes-links-module-FrmsalesModule-66cbdd0f0482290be92f7833b5139897"' :
                                            'id="xs-pipes-links-module-FrmsalesModule-66cbdd0f0482290be92f7833b5139897"' }>
                                            <li class="link">
                                                <a href="pipes/JdatePipe.html"
                                                    data-type="entity-link" data-context="sub-entity" data-context-id="modules">JdatePipe</a>
                                            </li>
                                        </ul>
                                    </li>
                            </li>
                            <li class="link">
                                <a href="modules/FrmsalesRoutingModule.html" data-type="entity-link">FrmsalesRoutingModule</a>
                            </li>
                            <li class="link">
                                <a href="modules/GraphQLModule.html" data-type="entity-link">GraphQLModule</a>
                            </li>
                            <li class="link">
                                <a href="modules/HomeModule.html" data-type="entity-link">HomeModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ?
                                            'data-target="#components-links-module-HomeModule-2bc1a11d6474303f4eec9673f17e6b58"' : 'data-target="#xs-components-links-module-HomeModule-2bc1a11d6474303f4eec9673f17e6b58"' }>
                                            <span class="icon ion-md-cog"></span>
                                            <span>Components</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="components-links-module-HomeModule-2bc1a11d6474303f4eec9673f17e6b58"' :
                                            'id="xs-components-links-module-HomeModule-2bc1a11d6474303f4eec9673f17e6b58"' }>
                                            <li class="link">
                                                <a href="components/HomeComponent.html"
                                                    data-type="entity-link" data-context="sub-entity" data-context-id="modules">HomeComponent</a>
                                            </li>
                                        </ul>
                                    </li>
                            </li>
                            <li class="link">
                                <a href="modules/HomeRoutingModule.html" data-type="entity-link">HomeRoutingModule</a>
                            </li>
                            <li class="link">
                                <a href="modules/MaterialModule.html" data-type="entity-link">MaterialModule</a>
                            </li>
                            <li class="link">
                                <a href="modules/MstmemberModule.html" data-type="entity-link">MstmemberModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ?
                                            'data-target="#components-links-module-MstmemberModule-469f10b672529c9db81c17500e172a15"' : 'data-target="#xs-components-links-module-MstmemberModule-469f10b672529c9db81c17500e172a15"' }>
                                            <span class="icon ion-md-cog"></span>
                                            <span>Components</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="components-links-module-MstmemberModule-469f10b672529c9db81c17500e172a15"' :
                                            'id="xs-components-links-module-MstmemberModule-469f10b672529c9db81c17500e172a15"' }>
                                            <li class="link">
                                                <a href="components/AddressComponent.html"
                                                    data-type="entity-link" data-context="sub-entity" data-context-id="modules">AddressComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/AdredaComponent.html"
                                                    data-type="entity-link" data-context="sub-entity" data-context-id="modules">AdredaComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/EdahelpComponent.html"
                                                    data-type="entity-link" data-context="sub-entity" data-context-id="modules">EdahelpComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/EdatblComponent.html"
                                                    data-type="entity-link" data-context="sub-entity" data-context-id="modules">EdatblComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/McdhelpComponent.html"
                                                    data-type="entity-link" data-context="sub-entity" data-context-id="modules">McdhelpComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/McdtblComponent.html"
                                                    data-type="entity-link" data-context="sub-entity" data-context-id="modules">McdtblComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/MstmemberComponent.html"
                                                    data-type="entity-link" data-context="sub-entity" data-context-id="modules">MstmemberComponent</a>
                                            </li>
                                        </ul>
                                    </li>
                            </li>
                            <li class="link">
                                <a href="modules/MstmemberRoutingModule.html" data-type="entity-link">MstmemberRoutingModule</a>
                            </li>
                </ul>
                </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ? 'data-target="#classes-links"' :
                            'data-target="#xs-classes-links"' }>
                            <span class="icon ion-ios-paper"></span>
                            <span>Classes</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? 'id="classes-links"' : 'id="xs-classes-links"' }>
                            <li class="link">
                                <a href="classes/AppPage.html" data-type="entity-link">AppPage</a>
                            </li>
                            <li class="link">
                                <a href="classes/System.html" data-type="entity-link">System</a>
                            </li>
                            <li class="link">
                                <a href="classes/TmStmp.html" data-type="entity-link">TmStmp</a>
                            </li>
                        </ul>
                    </li>
                        <li class="chapter">
                            <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ? 'data-target="#injectables-links"' :
                                'data-target="#xs-injectables-links"' }>
                                <span class="icon ion-md-arrow-round-down"></span>
                                <span>Injectables</span>
                                <span class="icon ion-ios-arrow-down"></span>
                            </div>
                            <ul class="links collapse " ${ isNormalMode ? 'id="injectables-links"' : 'id="xs-injectables-links"' }>
                                <li class="link">
                                    <a href="injectables/BunruiService.html" data-type="entity-link">BunruiService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/BunshoService.html" data-type="entity-link">BunshoService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/EdaService.html" data-type="entity-link">EdaService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/GoodsService.html" data-type="entity-link">GoodsService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/JyumeiService.html" data-type="entity-link">JyumeiService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/McdService.html" data-type="entity-link">McdService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/MembsService.html" data-type="entity-link">MembsService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/OkuriService.html" data-type="entity-link">OkuriService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/SoukoService.html" data-type="entity-link">SoukoService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/StaffService.html" data-type="entity-link">StaffService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/TabService.html" data-type="entity-link">TabService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/UserService.html" data-type="entity-link">UserService</a>
                                </li>
                            </ul>
                        </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ? 'data-target="#guards-links"' :
                            'data-target="#xs-guards-links"' }>
                            <span class="icon ion-ios-lock"></span>
                            <span>Guards</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? 'id="guards-links"' : 'id="xs-guards-links"' }>
                            <li class="link">
                                <a href="guards/BeforeunloadGuard.html" data-type="entity-link">BeforeunloadGuard</a>
                            </li>
                        </ul>
                    </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ? 'data-target="#interfaces-links"' :
                            'data-target="#xs-interfaces-links"' }>
                            <span class="icon ion-md-information-circle-outline"></span>
                            <span>Interfaces</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? ' id="interfaces-links"' : 'id="xs-interfaces-links"' }>
                            <li class="link">
                                <a href="interfaces/Edahlp.html" data-type="entity-link">Edahlp</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/Mcd.html" data-type="entity-link">Mcd</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/OnBeforeunload.html" data-type="entity-link">OnBeforeunload</a>
                            </li>
                        </ul>
                    </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ? 'data-target="#miscellaneous-links"'
                            : 'data-target="#xs-miscellaneous-links"' }>
                            <span class="icon ion-ios-cube"></span>
                            <span>Miscellaneous</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? 'id="miscellaneous-links"' : 'id="xs-miscellaneous-links"' }>
                            <li class="link">
                                <a href="miscellaneous/functions.html" data-type="entity-link">Functions</a>
                            </li>
                            <li class="link">
                                <a href="miscellaneous/typealiases.html" data-type="entity-link">Type aliases</a>
                            </li>
                            <li class="link">
                                <a href="miscellaneous/variables.html" data-type="entity-link">Variables</a>
                            </li>
                        </ul>
                    </li>
                        <li class="chapter">
                            <a data-type="chapter-link" href="routes.html"><span class="icon ion-ios-git-branch"></span>Routes</a>
                        </li>
                    <li class="chapter">
                        <a data-type="chapter-link" href="coverage.html"><span class="icon ion-ios-stats"></span>Documentation coverage</a>
                    </li>
                    <li class="divider"></li>
                    <li class="copyright">
                        Documentation generated using <a href="https://compodoc.app/" target="_blank">
                            <img data-src="images/compodoc-vectorise.png" class="img-responsive" data-type="compodoc-logo">
                        </a>
                    </li>
            </ul>
        </nav>
        `);
        this.innerHTML = tp.strings;
    }
});