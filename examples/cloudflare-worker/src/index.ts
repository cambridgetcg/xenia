// SPDX-License-Identifier: MPL-2.0

import {
  createSurfaceManifestResponse,
  createSurfaceNotAcceptableProblem,
  createSurfaceProblemResponse,
  createSurfaceResourceResponse,
  createSurfaceRouteNotFoundProblem,
  defineSurfaceManifest,
  negotiateSurfaceResource,
  SURFACE_MANIFEST_PATH,
} from "@agenttool/xenia/surface-0.1";

const HOME_HTML = `<!doctype html>
<html lang="en">
  <meta charset="utf-8">
  <title>XENIA Surface example</title>
  <h1>Welcome</h1>
  <p>This public door also has a JSON representation.</p>
  <p><a href="/.well-known/agent.json">Read the agent manifest</a></p>
</html>`;

function defineManifest(request: Request) {
  const homeUrl = new URL("/", request.url).href;

  return defineSurfaceManifest({
    service: {
      name: "XENIA Cloudflare Worker example",
      canonicalUrl: homeUrl,
      description: "A minimal host-side example with one public negotiated resource.",
    },
    resources: [
      {
        id: "entry",
        href: homeUrl,
        representations: ["application/json", "text/html"],
        defaultMediaType: "text/html",
        description: "Public orientation selected through the Accept request header.",
      },
    ],
  });
}

function methodNotAllowed(): Response {
  return new Response("Method not allowed", {
    status: 405,
    headers: {
      Allow: "GET",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

// Returning null means that the application router found no route. Any Response,
// including an application's own semantic 404, is a handled result and is preserved.
function routeApplication(
  request: Request,
  manifest: ReturnType<typeof defineManifest>,
): Response | null {
  const url = new URL(request.url);

  if (url.pathname === SURFACE_MANIFEST_PATH) {
    if (request.method !== "GET") return methodNotAllowed();
    return createSurfaceManifestResponse(manifest);
  }

  if (url.pathname === "/") {
    if (request.method !== "GET") return methodNotAllowed();
    const resource = manifest.resources[0];
    if (resource === undefined) return new Response("Manifest has no entry resource", { status: 500 });

    const representation = negotiateSurfaceResource(
      resource,
      request.headers.get("Accept"),
    );
    if (representation === "not-acceptable") {
      return createSurfaceProblemResponse(
        createSurfaceNotAcceptableProblem({ resource }),
      );
    }
    if (representation === "application/json") {
      return createSurfaceResourceResponse("application/json", {
        schema_version: "xenia.example.entry/1",
        service: manifest.service.name,
        manifest: new URL(SURFACE_MANIFEST_PATH, request.url).href,
      });
    }
    return createSurfaceResourceResponse("text/html", HOME_HTML);
  }

  return null;
}

export default {
  fetch(request: Request): Response {
    const manifest = defineManifest(request);
    const applicationResponse = routeApplication(request, manifest);
    if (applicationResponse !== null) return applicationResponse;

    // This is the real router fall-through, not a rewrite of arbitrary 404 responses.
    return createSurfaceProblemResponse(
      createSurfaceRouteNotFoundProblem({
        manifestUrl: new URL(SURFACE_MANIFEST_PATH, request.url).href,
      }),
    );
  },
};
