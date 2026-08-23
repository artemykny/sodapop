FROM golang:1.26.7-alpine AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/oddoneout-server ./cmd/oddoneout-server && \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/coordinator ./cmd/coordinator

FROM alpine:3.22

RUN apk add --no-cache ca-certificates && adduser -D -u 10001 sodapop
COPY --from=build /out/oddoneout-server /app/oddoneout-server
COPY --from=build /out/coordinator /app/coordinator
USER sodapop
EXPOSE 8080 8081
CMD ["/app/oddoneout-server"]
